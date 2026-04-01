// src/admin/ReviewOrders.jsx
// Admin Page 1: Review all order requests, fill in payment details, accept/reject.

import { useState, useEffect } from "react";
import { getAllOrderRequests, reviewOrderRequest } from "../firebase/firestoreService";

const PAYMENT_TYPES = ["UPI", "Credit Card", "Debit Card", "Cash", "Bank Transfer"];
const ORDER_TYPES   = ["Import", "Export", "Domestic", "Internal"];
const CATEGORIES    = ["Grant", "DGT", "Consumable / Fab / Test", "General"];

const STATUS_STYLE = {
  pending:  { label: "Pending",  cls: "badge--warning" },
  approved: { label: "Approved", cls: "badge--active"  },
  rejected: { label: "Rejected", cls: "badge--faulty"  },
  ordered:  { label: "Ordered",  cls: "badge--returnable" },
};

const PRIORITY_STYLE = {
  critical: { label: "Critical", cls: "badge--faulty"     },
  high:     { label: "High",     cls: "badge--ber"         },
  medium:   { label: "Medium",   cls: "badge--warning"     },
  low:      { label: "Low",      cls: "badge--active"      },
};

const emptyReview = { adminCategory:"", paymentType:"", orderType:"", finalAmount:"", adminRemarks:"", adminNotes:"" };

export default function ReviewOrders() {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilter] = useState("all");
  const [modalOrder, setModal]    = useState(null);
  const [review, setReview]       = useState(emptyReview);
  const [saving, setSaving]       = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    setLoading(true);
    try {
      const data = await getAllOrderRequests();
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }

  const openModal = (order) => {
    setModal(order);
    setSaveStatus(null);
    setReview({
      adminCategory:  order.adminCategory  || order.category || "",
      paymentType:    order.paymentType    || "",
      orderType:      order.orderType      || "",
      finalAmount:    order.finalAmount    || order.estimatedAmount || "",
      adminRemarks:   order.adminRemarks   || "",
      adminNotes:     order.adminNotes     || "",
    });
  };

  const handleReviewChange = (e) => setReview((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleDecision = async (decision) => {
    setSaving(true);
    try {
      await reviewOrderRequest(modalOrder.id, {
        ...review,
        finalAmount: review.finalAmount ? parseFloat(review.finalAmount) : null,
        status: decision,
      });
      setOrders((prev) => prev.map((o) => o.id === modalOrder.id ? { ...o, ...review, finalAmount: review.finalAmount ? parseFloat(review.finalAmount) : null, status: decision } : o));
      setSaveStatus(decision === "approved" ? "approved" : "rejected");
      setTimeout(() => setModal(null), 1200);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const filtered = filterStatus === "all" ? orders : orders.filter((o) => o.status === filterStatus);

  return (
    <div className="page" style={{ maxWidth: "100%" }}>
      <div className="page-header">
        <h2 className="page-title">Review Orders</h2>
        <p className="page-subtitle">Manage and process incoming order requests</p>
      </div>

      {/* Summary chips */}
      <div className="summary-chips">
        {["all","pending","approved","rejected","ordered"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`chip ${filterStatus === s ? "chip--active" : ""}`}>
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="chip-count">{s === "all" ? orders.length : orders.filter(o => o.status === s).length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-screen" style={{ height: "200px" }}><div className="loading-spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No {filterStatus === "all" ? "" : filterStatus} orders found.</p></div>
      ) : (
        <div className="results-table-wrapper">
          <table className="results-table">
            <thead>
              <tr>
                <th>Item</th><th>Qty</th><th>Priority</th><th>Category</th>
                <th>Est. Amount</th><th>Vendor</th><th>Project</th>
                <th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td className="td-name">{o.itemName}</td>
                  <td>{o.quantity}</td>
                  <td><span className={`badge ${PRIORITY_STYLE[o.priority]?.cls}`}>{PRIORITY_STYLE[o.priority]?.label ?? o.priority}</span></td>
                  <td>{o.category || "—"}</td>
                  <td>{o.estimatedAmount ? `₹${o.estimatedAmount.toLocaleString("en-IN")}` : "—"}</td>
                  <td>{o.suggestedVendor || "—"}</td>
                  <td>{o.projectName || "—"}</td>
                  <td><span className={`badge ${STATUS_STYLE[o.status]?.cls}`}>{STATUS_STYLE[o.status]?.label ?? o.status}</span></td>
                  <td>
                    <button className="btn-outline-sm" onClick={() => openModal(o)}>
                      {o.status === "pending" ? "Review" : "Edit"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review Modal */}
      {modalOrder && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Review Order</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>

            {/* Order summary */}
            <div className="order-summary-grid">
              <div className="summary-item"><span>Item</span><strong>{modalOrder.itemName}</strong></div>
              <div className="summary-item"><span>Qty</span><strong>{modalOrder.quantity}</strong></div>
              <div className="summary-item"><span>Priority</span><strong>{modalOrder.priority}</strong></div>
              <div className="summary-item"><span>Est. Amount</span><strong>{modalOrder.estimatedAmount ? `₹${modalOrder.estimatedAmount.toLocaleString("en-IN")}` : "—"}</strong></div>
              <div className="summary-item"><span>Vendor</span><strong>{modalOrder.suggestedVendor || "—"}</strong></div>
              <div className="summary-item"><span>Project</span><strong>{modalOrder.projectName || "—"}</strong></div>
              {modalOrder.orderLink && (
                <div className="summary-item summary-item--full">
                  <span>Order Link</span>
                  <a href={modalOrder.orderLink} target="_blank" rel="noreferrer" className="order-link">{modalOrder.orderLink}</a>
                </div>
              )}
              {modalOrder.notes && (
                <div className="summary-item summary-item--full"><span>User Notes</span><strong>{modalOrder.notes}</strong></div>
              )}
            </div>

            <div className="modal-divider" />
            <p className="modal-section-title">Admin Review</p>

            <div className="form-grid" style={{ marginTop: "0.75rem" }}>
              <div className="form-group">
                <label htmlFor="adminCategory">Category</label>
                <select id="adminCategory" name="adminCategory" value={review.adminCategory} onChange={handleReviewChange}>
                  <option value="">Select...</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="finalAmount">Final Amount (₹)</label>
                <input id="finalAmount" name="finalAmount" type="number" min="0" step="0.01"
                  value={review.finalAmount} onChange={handleReviewChange} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label htmlFor="paymentType">Type of Payment</label>
                <select id="paymentType" name="paymentType" value={review.paymentType} onChange={handleReviewChange}>
                  <option value="">Select...</option>
                  {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="orderType">Type of Order</label>
                <select id="orderType" name="orderType" value={review.orderType} onChange={handleReviewChange}>
                  <option value="">Select...</option>
                  {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group form-group--full">
                <label htmlFor="adminRemarks">Remarks</label>
                <input id="adminRemarks" name="adminRemarks" type="text" value={review.adminRemarks}
                  onChange={handleReviewChange} placeholder="Short remark for records..." />
              </div>
              <div className="form-group form-group--full">
                <label htmlFor="adminNotes">Internal Notes</label>
                <textarea id="adminNotes" name="adminNotes" value={review.adminNotes}
                  onChange={handleReviewChange} placeholder="Internal notes (not visible to user)..." rows={2} />
              </div>
            </div>

            {saveStatus === "approved" && <div className="alert alert--success" style={{ marginTop: "1rem" }}>✓ Order approved.</div>}
            {saveStatus === "rejected" && <div className="alert alert--error"  style={{ marginTop: "1rem" }}>✗ Order rejected.</div>}
            {saveStatus === "error"    && <div className="alert alert--error"  style={{ marginTop: "1rem" }}>Failed to save. Try again.</div>}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => handleDecision("rejected")} disabled={saving}>
                {saving ? "..." : "✗ Reject"}
              </button>
              <button className="btn-primary" style={{ width: "auto" }} onClick={() => handleDecision("approved")} disabled={saving}>
                {saving ? "..." : "✓ Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
