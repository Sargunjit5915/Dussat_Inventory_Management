// src/admin/VendorPipeline.jsx — groups approved orders by vendor, merges
// sibling orders from the same vendor + stage into one order view, and
// walks them through the vendor-negotiation stages: given to vendor ->
// vendor responds -> vendor accepts -> payment done -> order placed.

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { updateDoc, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import {
  getAllOrderRequests, giveOrdersToVendor, recordVendorResponse,
  markVendorAccepted, markPaymentDone, markOrderPlaced,
  normalizeStatus,
  ORDER_CLASSES, PAYMENT_TYPES, ORDER_TYPES, ORDER_MADE_BY,
} from "../firebase/firestoreService";
import { mergeOrdersByVendor, splitItemsByOrder } from "../utils/mergeOrders";
import OrderStageTimeline from "../components/OrderStageTimeline";
import EditCell from "../components/EditCell";

const PIPELINE_STATUSES = ["approved", "given_to_vendor", "vendor_responded", "vendor_accepted", "payment_done"];
const VENDOR_AVAILABLE_OPTIONS = ["Yes", "No", "Partial"];

export default function VendorPipeline() {
  const { user } = useAuth();
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState({});   // mergeKey -> bool
  const [modal, setModal]       = useState(null);  // the merged order-view being inspected
  const [modalItems, setModalItems] = useState([]);
  const [payment, setPayment]   = useState({ paymentType: "", finalAmount: "", gstAmount: "", orderType: "", orderMadeBy: "" });
  const [saving, setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [giving, setGiving]     = useState({});    // vendorKey -> bool

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    setLoading(true);
    try {
      const all = await getAllOrderRequests();
      setOrders(all.filter((o) => PIPELINE_STATUSES.includes(normalizeStatus(o.status))));
    } finally { setLoading(false); }
  }

  const merged = mergeOrdersByVendor(orders);
  const groups = {};
  merged.forEach((m) => {
    if (!groups[m.vendorKey]) groups[m.vendorKey] = { vendorName: m.vendorSite, entries: [] };
    groups[m.vendorKey].entries.push(m);
  });

  const toggleSelect = (mergeKey) => setSelected((p) => ({ ...p, [mergeKey]: !p[mergeKey] }));

  const handleGiveToVendor = async (vendorKey) => {
    const ids = groups[vendorKey].entries
      .filter((m) => normalizeStatus(m.status) === "approved" && selected[m.mergeKey])
      .flatMap((m) => m.memberIds);
    if (ids.length === 0) return;
    setGiving((p) => ({ ...p, [vendorKey]: true }));
    try {
      await giveOrdersToVendor(ids, user.uid);
      setOrders((prev) => prev.map((o) => ids.includes(o.id) ? { ...o, status: "given_to_vendor" } : o));
      setSelected((p) => {
        const n = { ...p };
        groups[vendorKey].entries.forEach((m) => delete n[m.mergeKey]);
        return n;
      });
    } finally { setGiving((p) => ({ ...p, [vendorKey]: false })); }
  };

  const openModal = (mergedEntry) => {
    setModal(mergedEntry);
    setModalItems(mergedEntry.items.map((i) => ({ ...i })));
    setPayment({
      paymentType: mergedEntry.paymentType || "",
      finalAmount: mergedEntry.finalAmount || "",
      gstAmount:   mergedEntry.gstAmount   || "",
      orderType:   mergedEntry.orderType   || "",
      orderMadeBy: mergedEntry.orderMadeBy || "",
    });
    setSaveStatus(null);
  };

  // Inline item edit — persists immediately to the item's own source order,
  // doesn't move the stage forward.
  const saveItemField = async (idx, field, value) => {
    const updated = modalItems.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    setModalItems(updated);
    const item = updated[idx];
    const targetOrderId = item._orderId || modal.id;
    const targetIdx = item._itemIdx ?? idx;
    const { _orderId, _itemIdx, _requestedByEmail, ...clean } = item;

    const orderSnap = await getDoc(doc(db, "orderRequests", targetOrderId));
    if (!orderSnap.exists()) return;
    const ownItems = [...(orderSnap.data().items || [])];
    ownItems[targetIdx] = clean;
    await updateDoc(doc(db, "orderRequests", targetOrderId), { items: ownItems });
    setOrders((prev) => prev.map((o) => o.id === targetOrderId ? { ...o, items: ownItems } : o));
  };

  const runAction = async (fn) => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const nextStatus = await fn();
      const buckets = splitItemsByOrder(modalItems, modal.memberIds, modal.id);
      if (PIPELINE_STATUSES.includes(nextStatus)) {
        setOrders((prev) => prev.map((o) =>
          modal.memberIds.includes(o.id) ? { ...o, status: nextStatus, items: buckets[o.id] || o.items } : o
        ));
      } else {
        // e.g. "order_placed" — no longer belongs on this page, drops to Order Status instead
        setOrders((prev) => prev.filter((o) => !modal.memberIds.includes(o.id)));
      }
      setModal((m) => m && { ...m, status: nextStatus, items: modalItems });
      setSaveStatus("success");
      setTimeout(() => setModal(null), 900);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    } finally { setSaving(false); }
  };

  const handleRecordVendorResponse = () => runAction(async () => {
    const buckets = splitItemsByOrder(modalItems, modal.memberIds, modal.id);
    await Promise.all(modal.memberIds.map((id) => recordVendorResponse(id, buckets[id])));
    return "vendor_responded";
  });
  const handleMarkVendorAccepted = () => runAction(async () => {
    await Promise.all(modal.memberIds.map((id) => markVendorAccepted(id)));
    return "vendor_accepted";
  });
  const handleMarkPaymentDone = () => runAction(async () => {
    const buckets = splitItemsByOrder(modalItems, modal.memberIds, modal.id);
    const subtotals = {};
    modal.memberIds.forEach((id) => {
      subtotals[id] = (buckets[id] || []).reduce((s, i) =>
        s + (parseFloat(i.estimatedAmount) || 0) * (parseInt(i.quantity) || 1), 0);
    });
    const totalSubtotal = Object.values(subtotals).reduce((a, b) => a + b, 0);
    const manualTotal = payment.finalAmount ? parseFloat(payment.finalAmount) : null;

    await Promise.all(modal.memberIds.map((id) => {
      const allocated = manualTotal !== null
        ? (totalSubtotal > 0 ? manualTotal * (subtotals[id] / totalSubtotal) : manualTotal / modal.memberIds.length)
        : subtotals[id];
      return markPaymentDone(id, {
        paymentType: payment.paymentType,
        finalAmount: allocated,
        gstAmount:   payment.gstAmount ? parseFloat(payment.gstAmount) : null,
        orderType:   payment.orderType,
        orderMadeBy: payment.orderMadeBy,
      }, user.uid);
    }));
    return "payment_done";
  });
  const handleMarkOrderPlaced = () => runAction(async () => {
    await Promise.all(modal.memberIds.map((id) => markOrderPlaced(id, user.uid)));
    return "order_placed";
  });

  if (loading) return <div className="loading-screen" style={{ height: "200px" }}><div className="loading-spinner" /></div>;

  const modalStage = modal ? normalizeStatus(modal.status) : null;

  return (
    <div className="page" style={{ maxWidth: "100%" }}>
      <div className="page-header">
        <h2 className="page-title">Vendor Pipeline</h2>
        <p className="page-subtitle">Group approved orders by vendor, hand them off, and track vendor negotiation through to placement</p>
      </div>

      {Object.keys(groups).length === 0 ? (
        <div className="empty-state"><p>No orders currently in the vendor pipeline.</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {Object.entries(groups).map(([vendorKey, group]) => {
            const selectableCount = group.entries.filter((m) => normalizeStatus(m.status) === "approved" && selected[m.mergeKey])
              .reduce((s, m) => s + m.memberIds.length, 0);
            return (
              <div key={vendorKey} className="vendor-group">
                <div className="vendor-group-header">
                  <strong>{group.vendorName}</strong>
                  <span style={{ color: "var(--text-muted)" }}>{group.entries.length} order{group.entries.length !== 1 ? "s" : ""}</span>
                  {selectableCount > 0 && (
                    <button className="btn-outline-sm" onClick={() => handleGiveToVendor(vendorKey)} disabled={giving[vendorKey]}>
                      {giving[vendorKey] ? "..." : `Give ${selectableCount} to Vendor`}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {group.entries.map((m) => {
                    const total = m.finalAmount || m.items.reduce((s, i) => s + (parseFloat(i.estimatedAmount) || 0) * (parseInt(i.quantity) || 1), 0) || 0;
                    const isApproved = normalizeStatus(m.status) === "approved";
                    return (
                      <div key={m.mergeKey} className="order-card order-card--clickable" onClick={() => openModal(m)}>
                        <div className="order-card-info">
                          {isApproved && (
                            <input type="checkbox" checked={!!selected[m.mergeKey]}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelect(m.mergeKey)} />
                          )}
                          {m.isMerged && <span className="field-hint" style={{display:"inline"}}>({m.memberIds.length} requests combined)</span>}
                          <span>{m.items.length} item{m.items.length !== 1 ? "s" : ""}</span>
                          <span>{m.projectName || "—"}</span>
                          <span className="order-requester">✉ {m.requestedByEmails.join(", ") || "—"}</span>
                          <OrderStageTimeline status={m.status} variant="badge" />
                        </div>
                        {total > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent)" }}>₹{total.toLocaleString("en-IN")}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal--wide modal--xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.vendorSite || "Order"}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>

            {modal.isMerged && (
              <p className="field-hint" style={{ marginBottom: "0.5rem" }}>
                Combines {modal.memberIds.length} requests — requested by {modal.requestedByEmails.join(", ")}
              </p>
            )}

            <OrderStageTimeline status={modal.status} variant="timeline" />

            <table className="results-table">
              <thead>
                <tr><th>#</th><th>Item</th><th>Class</th><th>Qty</th><th>Amount (₹)</th><th>Vendor Available</th><th>Vendor Note</th></tr>
              </thead>
              <tbody>
                {modalItems.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{idx + 1}</td>
                    <td className="td-name">
                      {item.name}
                      {modal.requestedByEmails.length > 1 && item._requestedByEmail && (
                        <span className="field-hint" style={{display:"block"}}>{item._requestedByEmail}</span>
                      )}
                    </td>
                    <td><EditCell value={item.orderClass} options={ORDER_CLASSES} onSave={(v) => saveItemField(idx, "orderClass", v)} /></td>
                    <td><EditCell value={item.quantity} type="number" onSave={(v) => saveItemField(idx, "quantity", v)} /></td>
                    <td><EditCell value={item.estimatedAmount} type="number" onSave={(v) => saveItemField(idx, "estimatedAmount", v)} /></td>
                    <td><EditCell value={item.vendorAvailable} options={VENDOR_AVAILABLE_OPTIONS} onSave={(v) => saveItemField(idx, "vendorAvailable", v)} /></td>
                    <td><EditCell value={item.vendorNote} onSave={(v) => saveItemField(idx, "vendorNote", v)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="modal-divider" />

            {modalStage === "approved" && (
              <p className="field-hint">Select this order via the checkbox in the vendor group above, then click "Give to Vendor".</p>
            )}

            {modalStage === "given_to_vendor" && (
              <div className="modal-actions">
                <button className="btn-primary" style={{ width: "auto" }} onClick={handleRecordVendorResponse} disabled={saving}>
                  {saving ? "..." : "Record Vendor Response"}
                </button>
              </div>
            )}

            {modalStage === "vendor_responded" && (
              <div className="modal-actions">
                <button className="btn-primary" style={{ width: "auto" }} onClick={handleMarkVendorAccepted} disabled={saving}>
                  {saving ? "..." : "Mark Vendor Accepted"}
                </button>
              </div>
            )}

            {modalStage === "vendor_accepted" && (
              <>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Payment Type</label>
                    <select value={payment.paymentType} onChange={(e) => setPayment((p) => ({ ...p, paymentType: e.target.value }))}>
                      <option value="">Select...</option>
                      {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Final Amount (₹) <span className="field-hint" style={{display:"inline"}}>— leave blank to use items total</span></label>
                    <input type="number" min="0" step="0.01" value={payment.finalAmount}
                      onChange={(e) => setPayment((p) => ({ ...p, finalAmount: e.target.value }))} placeholder="Auto-calculated from items" />
                  </div>
                  <div className="form-group">
                    <label>GST Amount (₹)</label>
                    <input type="number" min="0" step="0.01" value={payment.gstAmount}
                      onChange={(e) => setPayment((p) => ({ ...p, gstAmount: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Type of Order</label>
                    <select value={payment.orderType} onChange={(e) => setPayment((p) => ({ ...p, orderType: e.target.value }))}>
                      <option value="">Select...</option>
                      {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group form-group--full">
                    <label>Order Made By</label>
                    <select value={payment.orderMadeBy} onChange={(e) => setPayment((p) => ({ ...p, orderMadeBy: e.target.value }))}>
                      <option value="">Select...</option>
                      {ORDER_MADE_BY.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                {modal.isMerged && (
                  <p className="field-hint">Final Amount is split across the {modal.memberIds.length} combined requests in proportion to each request's own items total.</p>
                )}
                <div className="modal-actions">
                  <button className="btn-primary" style={{ width: "auto" }} onClick={handleMarkPaymentDone} disabled={saving}>
                    {saving ? "..." : "Mark Payment Done"}
                  </button>
                </div>
              </>
            )}

            {modalStage === "payment_done" && (
              <div className="modal-actions">
                <button className="btn-primary" style={{ width: "auto" }} onClick={handleMarkOrderPlaced} disabled={saving}>
                  {saving ? "..." : "Mark Order Placed"}
                </button>
              </div>
            )}

            {saveStatus === "success" && <div className="alert alert--success" style={{ marginTop: "1rem" }}>✓ Saved.</div>}
            {saveStatus === "error"   && <div className="alert alert--error"   style={{ marginTop: "1rem" }}>Failed to save. Try again.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
