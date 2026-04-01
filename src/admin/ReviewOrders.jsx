// src/admin/ReviewOrders.jsx — v3: cart-based, shows requester email, editable items

import { useState, useEffect } from "react";
import {
  getAllOrderRequests, reviewOrderRequest,
  CATEGORIES, PAYMENT_TYPES, ORDER_TYPES, ORDER_MADE_BY, PRIORITIES, ITEM_TYPES
} from "../firebase/firestoreService";

const STATUS_STYLE = {
  pending:   { label: "Pending",   cls: "badge--warning"    },
  approved:  { label: "Approved",  cls: "badge--active"     },
  rejected:  { label: "Rejected",  cls: "badge--faulty"     },
  completed: { label: "Completed", cls: "badge--returnable" },
};

const PRIORITY_STYLE = {
  critical: "badge--faulty", high: "badge--ber",
  medium: "badge--warning",  low:  "badge--active",
};

const emptyReview = {
  adminCategory:"", paymentType:"", orderType:"",
  orderMadeBy:"", finalAmount:"", adminRemarks:"", adminNotes:""
};

export default function ReviewOrders() {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("pending");
  const [modal, setModal]     = useState(null);
  const [review, setReview]   = useState(emptyReview);
  const [editItems, setEditItems] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    setLoading(true);
    try { setOrders(await getAllOrderRequests()); }
    finally { setLoading(false); }
  }

  const openModal = (order) => {
    setModal(order);
    setSaveStatus(null);
    setEditItems(order.items ? order.items.map((i) => ({ ...i })) : []);
    setReview({
      adminCategory: order.adminCategory || order.category || "",
      paymentType:   order.paymentType   || "",
      orderType:     order.orderType     || "",
      orderMadeBy:   order.orderMadeBy   || "",
      finalAmount:   order.finalAmount   || "",
      adminRemarks:  order.adminRemarks  || "",
      adminNotes:    order.adminNotes    || "",
    });
  };

  const handleReviewChange = (e) => setReview((p) => ({ ...p, [e.target.name]: e.target.value }));

  // Edit items in modal
  const handleItemEdit = (idx, field, value) => {
    setEditItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };
  const removeModalItem = (idx) => setEditItems((p) => p.filter((_, i) => i !== idx));
  const addModalItem = () => setEditItems((p) => [...p, { name:"", type:"", quantity:"", estimatedAmount:"", notes:"", arrived: false }]);

  const handleDecision = async (decision) => {
    if (editItems.length === 0) { setSaveStatus("error_empty"); return; }
    setSaving(true);
    try {
      // Recalculate finalAmount from items if not manually set
      const computedTotal = editItems.reduce((s, i) =>
        s + (parseFloat(i.estimatedAmount) || 0) * (parseInt(i.quantity) || 1), 0);

      await reviewOrderRequest(modal.id, {
        ...review,
        items: editItems,
        finalAmount: review.finalAmount ? parseFloat(review.finalAmount) : computedTotal,
        status: decision,
      });
      setOrders((prev) => prev.map((o) =>
        o.id === modal.id ? { ...o, ...review, items: editItems, status: decision } : o
      ));
      setSaveStatus(decision);
      setTimeout(() => setModal(null), 1200);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    } finally { setSaving(false); }
  };

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const counts = { all: orders.length, pending: 0, approved: 0, rejected: 0, completed: 0 };
  orders.forEach((o) => { if (counts[o.status] !== undefined) counts[o.status]++; });

  return (
    <div className="page" style={{ maxWidth: "100%" }}>
      <div className="page-header">
        <h2 className="page-title">Review Orders</h2>
        <p className="page-subtitle">Review and approve order lists submitted by users</p>
      </div>

      <div className="summary-chips">
        {["pending","all","approved","rejected","completed"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`chip ${filter === s ? "chip--active" : ""}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="chip-count">{counts[s]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-screen" style={{ height:"200px" }}><div className="loading-spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No {filter} orders.</p></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          {filtered.map((o) => {
            const total = (o.finalAmount) || o.items?.reduce((s,i) => s+(parseFloat(i.estimatedAmount)||0)*(parseInt(i.quantity)||1),0) || 0;
            return (
              <div key={o.id} className="order-card">
                <div className="order-card-info">
                  <strong>{o.vendorSite || "—"}</strong>
                  <span>{o.items?.length || 0} item{o.items?.length !== 1?"s":""}</span>
                  <span className={`badge ${PRIORITY_STYLE[o.priority]}`}>{o.priority}</span>
                  <span>{o.projectName || "—"}</span>
                  <span>{o.category || "—"}</span>
                  <span className="order-requester">✉ {o.requestedByEmail || "—"}</span>
                  <span className={`badge ${STATUS_STYLE[o.status]?.cls}`}>{STATUS_STYLE[o.status]?.label}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                  {total > 0 && <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.8rem", color:"var(--accent)" }}>₹{total.toLocaleString("en-IN")}</span>}
                  <button className="btn-outline-sm" onClick={() => openModal(o)}>
                    {o.status === "pending" ? "Review" : "View / Edit"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal--wide modal--xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Review Order — {modal.vendorSite}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>

            {/* Order meta */}
            <div className="order-summary-grid" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
              <div className="summary-item"><span>Requested By</span><strong>{modal.requestedByEmail || "—"}</strong></div>
              <div className="summary-item"><span>Project</span><strong>{modal.projectName || "—"}</strong></div>
              <div className="summary-item"><span>Priority</span><strong>{modal.priority}</strong></div>
              <div className="summary-item"><span>Category</span><strong>{modal.category || "—"}</strong></div>
              {modal.orderLink && (
                <div className="summary-item summary-item--full">
                  <span>Order Link</span>
                  <a href={modal.orderLink} target="_blank" rel="noreferrer" className="order-link">{modal.orderLink}</a>
                </div>
              )}
              {modal.notes && <div className="summary-item summary-item--full"><span>User Notes</span><strong>{modal.notes}</strong></div>}
            </div>

            {/* Editable items */}
            <div style={{ margin:"1rem 0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.5rem" }}>
                <p className="modal-section-title">Items (editable)</p>
                <button className="btn-outline-sm" onClick={addModalItem}>+ Add Item</button>
              </div>
              {editItems.map((item, idx) => (
                <div key={idx} className="cart-item-row cart-item-row--compact">
                  <div className="cart-item-number">{idx+1}</div>
                  <div className="cart-item-fields">
                    <div className="form-group">
                      <label>Name</label>
                      <input type="text" value={item.name} onChange={(e) => handleItemEdit(idx,"name",e.target.value)} placeholder="Item name" />
                    </div>
                    <div className="form-group">
                      <label>Type</label>
                      <select value={item.type} onChange={(e) => handleItemEdit(idx,"type",e.target.value)}>
                        <option value="">Select...</option>
                        {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Qty</label>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => handleItemEdit(idx,"quantity",e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Amount (₹)</label>
                      <input type="number" min="0" step="0.01" value={item.estimatedAmount} onChange={(e) => handleItemEdit(idx,"estimatedAmount",e.target.value)} />
                    </div>
                  </div>
                  <button className="cart-item-remove" onClick={() => removeModalItem(idx)} title="Remove">✕</button>
                </div>
              ))}
              <div className="cart-total-row">
                <span>Items Total</span>
                <strong>₹{editItems.reduce((s,i) => s+(parseFloat(i.estimatedAmount)||0)*(parseInt(i.quantity)||1),0).toLocaleString("en-IN",{minimumFractionDigits:2})}</strong>
              </div>
            </div>

            <div className="modal-divider" />
            <p className="modal-section-title" style={{ marginBottom:"0.75rem" }}>Admin Review</p>

            <div className="form-grid">
              <div className="form-group">
                <label>Category</label>
                <select name="adminCategory" value={review.adminCategory} onChange={handleReviewChange}>
                  <option value="">Select...</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Final Amount (₹) <span className="field-hint" style={{display:"inline"}}>— leave blank to use items total</span></label>
                <input name="finalAmount" type="number" min="0" step="0.01" value={review.finalAmount} onChange={handleReviewChange} placeholder="Auto-calculated from items" />
              </div>
              <div className="form-group">
                <label>Type of Payment</label>
                <select name="paymentType" value={review.paymentType} onChange={handleReviewChange}>
                  <option value="">Select...</option>
                  {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Type of Order</label>
                <select name="orderType" value={review.orderType} onChange={handleReviewChange}>
                  <option value="">Select...</option>
                  {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group form-group--full">
                <label>Order Made By</label>
                <select name="orderMadeBy" value={review.orderMadeBy} onChange={handleReviewChange}>
                  <option value="">Select...</option>
                  {ORDER_MADE_BY.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group form-group--full">
                <label>Remarks</label>
                <input name="adminRemarks" type="text" value={review.adminRemarks} onChange={handleReviewChange} placeholder="Short remark for records..." />
              </div>
              <div className="form-group form-group--full">
                <label>Internal Notes</label>
                <textarea name="adminNotes" value={review.adminNotes} onChange={handleReviewChange} rows={2} placeholder="Internal notes (not visible to user)..." />
              </div>
            </div>

            {saveStatus === "approved"    && <div className="alert alert--success" style={{marginTop:"1rem"}}>✓ Order approved.</div>}
            {saveStatus === "rejected"    && <div className="alert alert--error"   style={{marginTop:"1rem"}}>✗ Order rejected.</div>}
            {saveStatus === "error"       && <div className="alert alert--error"   style={{marginTop:"1rem"}}>Failed to save. Try again.</div>}
            {saveStatus === "error_empty" && <div className="alert alert--error"   style={{marginTop:"1rem"}}>Order must have at least one item.</div>}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-danger"  onClick={() => handleDecision("rejected")} disabled={saving}>{saving?"...":"✗ Reject"}</button>
              <button className="btn-primary" style={{width:"auto"}} onClick={() => handleDecision("approved")} disabled={saving}>{saving?"...":"✓ Approve"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}