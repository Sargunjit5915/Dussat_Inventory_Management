// src/admin/OrderStatus.jsx — v4: PV number entry per order, per-item arrived tracking

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getAllOrderRequests, updateInvoiceNumber } from "../firebase/firestoreService";
import { updateDoc, doc, addDoc, collection, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function OrderStatus() {
  const { user } = useAuth();
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [invoiceEditing, setInvoiceEditing] = useState({});
  const [pvEditing, setPvEditing]           = useState({});   // orderId → draft PV string
  const [saving, setSaving]     = useState({});
  const [msg, setMsg]           = useState({});

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    setLoading(true);
    try {
      const all = await getAllOrderRequests();
      setOrders(all.filter((o) => o.status === "approved" || o.status === "completed"));
    } finally { setLoading(false); }
  }

  const toggleExpand = (id) => setExpanded((p) => p === id ? null : id);

  // Mark individual item as arrived → all items from same order go into ONE inventory PV doc
  const handleMarkArrived = async (order, itemIdx) => {
    const key = `${order.id}_${itemIdx}`;
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      const item = order.items[itemIdx];
      const newItem = {
        name:            item.name,
        quantity:        parseInt(item.quantity) || 1,
        storageLocation: item.storageLocation || "Pending assignment",
        notes:           item.notes || "",
        type:            item.type || "Capital",
      };

      if (order.inventoryDocId) {
        // PV doc already exists — append this item to its items[] array
        const invSnap = await getDoc(doc(db, "inventory", order.inventoryDocId));
        if (invSnap.exists()) {
          const existingItems = invSnap.data().items || [];
          const existingAmount = invSnap.data().amount || 0;
          const addAmount = item.estimatedAmount ? parseFloat(item.estimatedAmount) : 0;
          await updateDoc(doc(db, "inventory", order.inventoryDocId), {
            items:       [...existingItems, newItem],
            amount:      existingAmount + addAmount,
            totalAmount: existingAmount + addAmount,
            updatedAt:   serverTimestamp(),
          });
        }
      } else {
        // First item arriving — create the PV document for this order
        const invRef = await addDoc(collection(db, "inventory"), {
          pvNumber:         order.pvNumber || "—",
          date:             new Date().toISOString().split("T")[0],
          description:      order.vendorSite || "Order",
          descriptionLower: (order.vendorSite || "order").toLowerCase(),
          type:             item.type || "Capital",
          category:         order.adminCategory || order.category || null,
          projectName:      order.projectName   || null,
          amount:           item.estimatedAmount ? parseFloat(item.estimatedAmount) : null,
          gstAmount:        order.gstAmount      || null,
          otherAmount:      null,
          totalAmount:      item.estimatedAmount ? parseFloat(item.estimatedAmount) : null,
          payee:            order.orderMadeBy    || null,
          sourceOrderId:    order.id,
          items:            [newItem],
          status:           "active",
          faultyCategory:   null,
          addedBy:          user.uid,
          createdAt:        serverTimestamp(),
          updatedAt:        serverTimestamp(),
        });
        // Store the inventory doc ID back on the order so future items append to it
        await updateDoc(doc(db, "orderRequests", order.id), {
          inventoryDocId: invRef.id,
          updatedAt:      serverTimestamp(),
        });
        setOrders((prev) => prev.map((o) =>
          o.id === order.id ? { ...o, inventoryDocId: invRef.id } : o
        ));
      }

      // Mark item as arrived in order doc
      const orderSnap = await getDoc(doc(db, "orderRequests", order.id));
      if (!orderSnap.exists()) return;
      const items = [...(orderSnap.data().items || [])];
      items[itemIdx] = { ...items[itemIdx], arrived: true };
      const allArrived = items.every((i) => i.arrived);
      await updateDoc(doc(db, "orderRequests", order.id), {
        items,
        ...(allArrived ? { status: "completed" } : {}),
        updatedAt: serverTimestamp(),
      });

      setMsg((p) => ({ ...p, [key]: "success" }));
      setOrders((prev) => prev.map((o) => {
        if (o.id !== order.id) return o;
        const updItems = o.items.map((it, i) => i === itemIdx ? { ...it, arrived: true } : it);
        return { ...o, items: updItems, status: updItems.every(it => it.arrived) ? "completed" : o.status };
      }));
      setTimeout(() => setMsg((p) => ({ ...p, [key]: null })), 2000);
    } catch (err) {
      console.error(err);
      setMsg((p) => ({ ...p, [key]: "error" }));
    } finally { setSaving((p) => ({ ...p, [key]: false })); }
  };

  // Save PV number to order document
  const handleSavePV = async (orderId) => {
    const val = pvEditing[orderId] ?? "";
    setSaving((p) => ({ ...p, [`pv_${orderId}`]: true }));
    try {
      await updateDoc(doc(db, "orderRequests", orderId), { pvNumber: val, updatedAt: serverTimestamp() });
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, pvNumber: val } : o));
      setMsg((p) => ({ ...p, [`pv_${orderId}`]: "success" }));
      setPvEditing((p) => { const n = { ...p }; delete n[orderId]; return n; });
      setTimeout(() => setMsg((p) => ({ ...p, [`pv_${orderId}`]: null })), 2000);
    } catch (err) {
      setMsg((p) => ({ ...p, [`pv_${orderId}`]: "error" }));
    } finally { setSaving((p) => ({ ...p, [`pv_${orderId}`]: false })); }
  };

  const handleSaveInvoice = async (orderId) => {
    const val = invoiceEditing[orderId] ?? "";
    setSaving((p) => ({ ...p, [`inv_${orderId}`]: true }));
    try {
      await updateInvoiceNumber(orderId, val);
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, invoiceNumber: val } : o));
      setMsg((p) => ({ ...p, [`inv_${orderId}`]: "success" }));
      setInvoiceEditing((p) => { const n = { ...p }; delete n[orderId]; return n; });
      setTimeout(() => setMsg((p) => ({ ...p, [`inv_${orderId}`]: null })), 2000);
    } catch (err) {
      setMsg((p) => ({ ...p, [`inv_${orderId}`]: "error" }));
    } finally { setSaving((p) => ({ ...p, [`inv_${orderId}`]: false })); }
  };

  if (loading) return <div className="loading-screen" style={{ height:"200px" }}><div className="loading-spinner" /></div>;

  return (
    <div className="page" style={{ maxWidth:"100%" }}>
      <div className="page-header">
        <h2 className="page-title">Order Status</h2>
        <p className="page-subtitle">Track approved orders — assign PV number, mark items as arrived, add invoice</p>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state"><p>No approved orders yet.</p></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          {orders.map((order) => {
            const arrivedCount = order.items?.filter((i) => i.arrived).length || 0;
            const totalCount   = order.items?.length || 0;
            const isComplete   = order.status === "completed";
            const isExpanded   = expanded === order.id;
            const pvKey        = `pv_${order.id}`;
            const invKey       = `inv_${order.id}`;
            const editingPV    = pvEditing[order.id] !== undefined;
            const editingInv   = invoiceEditing[order.id] !== undefined;

            return (
              <div key={order.id} className={`order-status-card ${isComplete ? "order-status-card--done" : ""}`}>
                <div className="order-status-header" onClick={() => toggleExpand(order.id)}>
                  <div className="order-status-meta">
                    <strong className="order-status-vendor">{order.vendorSite || "—"}</strong>
                    <span>{order.projectName || "—"}</span>
                    <span>{order.adminCategory || order.category || "—"}</span>
                    {order.orderMadeBy && <span>👤 {order.orderMadeBy}</span>}
                    {order.pvNumber && <span className="pv-number-badge">PV {order.pvNumber}</span>}
                    {order.invoiceNumber && <span className="invoice-badge">INV# {order.invoiceNumber}</span>}
                    <span className={`badge ${isComplete ? "badge--active" : "badge--warning"}`}>
                      {isComplete ? "All Arrived" : `${arrivedCount}/${totalCount} arrived`}
                    </span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                    {order.finalAmount && (
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.8rem", color:"var(--accent)" }}>
                        ₹{Number(order.finalAmount).toLocaleString("en-IN")}
                      </span>
                    )}
                    <span className="expand-toggle">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="order-status-body">

                    {/* PV Number */}
                    <div className="invoice-row">
                      <label className="invoice-label">PV Number</label>
                      {editingPV ? (
                        <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
                          <input type="text" value={pvEditing[order.id]}
                            onChange={(e) => setPvEditing((p) => ({ ...p, [order.id]: e.target.value }))}
                            placeholder="e.g. 342" style={{ maxWidth:"160px" }} />
                          <button className="btn-outline-sm" onClick={() => handleSavePV(order.id)}
                            disabled={saving[pvKey]}>{saving[pvKey] ? "..." : "Save"}</button>
                          <button className="btn-secondary" style={{ padding:"0.25rem 0.5rem", fontSize:"0.7rem" }}
                            onClick={() => setPvEditing((p) => { const n={...p}; delete n[order.id]; return n; })}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
                          <span style={{ color: order.pvNumber ? "var(--text)" : "var(--text-muted)", fontSize:"0.8125rem" }}>
                            {order.pvNumber || "Not assigned"}
                          </span>
                          <button className="btn-outline-sm"
                            onClick={() => setPvEditing((p) => ({ ...p, [order.id]: order.pvNumber || "" }))}>
                            {order.pvNumber ? "Edit" : "Assign"}
                          </button>
                        </div>
                      )}
                      {msg[pvKey] === "success" && <span style={{ color:"var(--success)", fontSize:"0.75rem" }}>✓ Saved</span>}
                      {msg[pvKey] === "error"   && <span style={{ color:"var(--danger)",  fontSize:"0.75rem" }}>✗ Error</span>}
                    </div>

                    {/* Invoice Number */}
                    <div className="invoice-row">
                      <label className="invoice-label">Invoice Number</label>
                      {editingInv ? (
                        <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
                          <input type="text" value={invoiceEditing[order.id]}
                            onChange={(e) => setInvoiceEditing((p) => ({ ...p, [order.id]: e.target.value }))}
                            placeholder="e.g. INV-2024-001" style={{ maxWidth:"220px" }} />
                          <button className="btn-outline-sm" onClick={() => handleSaveInvoice(order.id)}
                            disabled={saving[invKey]}>{saving[invKey] ? "..." : "Save"}</button>
                          <button className="btn-secondary" style={{ padding:"0.25rem 0.5rem", fontSize:"0.7rem" }}
                            onClick={() => setInvoiceEditing((p) => { const n={...p}; delete n[order.id]; return n; })}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
                          <span style={{ color: order.invoiceNumber ? "var(--text)" : "var(--text-muted)", fontSize:"0.8125rem" }}>
                            {order.invoiceNumber || "Not set"}
                          </span>
                          <button className="btn-outline-sm"
                            onClick={() => setInvoiceEditing((p) => ({ ...p, [order.id]: order.invoiceNumber || "" }))}>
                            {order.invoiceNumber ? "Edit" : "Add"}
                          </button>
                        </div>
                      )}
                      {msg[invKey] === "success" && <span style={{ color:"var(--success)", fontSize:"0.75rem" }}>✓ Saved</span>}
                      {msg[invKey] === "error"   && <span style={{ color:"var(--danger)",  fontSize:"0.75rem" }}>✗ Error</span>}
                    </div>

                    {/* Items */}
                    <table className="results-table" style={{ marginTop:"0.75rem" }}>
                      <thead>
                        <tr><th>#</th><th>Item</th><th>Type</th><th>Qty</th><th>Amount (₹)</th><th>Status</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {order.items?.map((item, idx) => {
                          const key = `${order.id}_${idx}`;
                          return (
                            <tr key={idx} style={{ opacity: item.arrived ? 0.6 : 1 }}>
                              <td style={{ color:"var(--text-muted)", fontFamily:"var(--font-mono)", fontSize:"0.7rem" }}>{idx+1}</td>
                              <td className="td-name">{item.name}</td>
                              <td>{item.type || "—"}</td>
                              <td>{item.quantity}</td>
                              <td>{item.estimatedAmount ? `₹${Number(item.estimatedAmount).toLocaleString("en-IN")}` : "—"}</td>
                              <td>
                                {item.arrived
                                  ? <span className="badge badge--active">✓ In Inventory</span>
                                  : <span className="badge badge--warning">Pending</span>}
                              </td>
                              <td>
                                {!item.arrived && (
                                  <button className="btn-outline-sm" onClick={() => handleMarkArrived(order, idx)}
                                    disabled={saving[key]}>
                                    {saving[key] ? "..." : "Mark Arrived"}
                                  </button>
                                )}
                                {msg[key] === "success" && <span style={{ color:"var(--success)", fontSize:"0.72rem", marginLeft:"0.5rem" }}>✓ Added</span>}
                                {msg[key] === "error"   && <span style={{ color:"var(--danger)",  fontSize:"0.72rem", marginLeft:"0.5rem" }}>✗ Error</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Order details */}
                    <div className="order-summary-grid" style={{ marginTop:"1rem", gridTemplateColumns:"repeat(3,1fr)" }}>
                      {order.paymentType  && <div className="summary-item"><span>Payment</span><strong>{order.paymentType}</strong></div>}
                      {order.orderType    && <div className="summary-item"><span>Order Type</span><strong>{order.orderType}</strong></div>}
                      {order.finalAmount  && <div className="summary-item"><span>Final Amount</span><strong>₹{Number(order.finalAmount).toLocaleString("en-IN")}</strong></div>}
                      {order.gstAmount    && <div className="summary-item"><span>GST Amount</span><strong>₹{Number(order.gstAmount).toLocaleString("en-IN")}</strong></div>}
                      {order.adminRemarks && <div className="summary-item summary-item--full"><span>Remarks</span><strong>{order.adminRemarks}</strong></div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}