// src/pages/OrderRequests.jsx — v3: cart-based with draft support

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  saveDraftOrder, submitOrderRequest, getUserDrafts,
  getUserOrders, deleteDraft,
  ITEM_TYPES, CATEGORIES, PROJECTS, PRIORITIES
} from "../firebase/firestoreService";

const emptyItem = { name: "", type: "", quantity: "", estimatedAmount: "", notes: "" };

const emptyCart = {
  vendorSite: "", orderLink: "", projectName: "", category: "",
  priority: "", notes: "", items: [{ ...emptyItem }],
};

const STATUS_STYLE = {
  pending:   { label: "Pending",   cls: "badge--warning"    },
  approved:  { label: "Approved",  cls: "badge--active"     },
  rejected:  { label: "Rejected",  cls: "badge--faulty"     },
  completed: { label: "Completed", cls: "badge--returnable" },
};

export default function OrderRequests() {
  const { user } = useAuth();
  const [view, setView]         = useState("list"); // "list" | "editor"
  const [drafts, setDrafts]     = useState([]);
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editingId, setEditingId] = useState(null); // null = new cart
  const [cart, setCart]         = useState(emptyCart);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [d, o] = await Promise.all([getUserDrafts(user.uid), getUserOrders(user.uid)]);
    setDrafts(d); setOrders(o); setLoading(false);
  }

  // Auto-set category to DGT when Non-Patang is selected
  const handleCartChange = (e) => {
    const { name, value } = e.target;
    setCart((p) => ({
      ...p,
      [name]: value,
      ...(name === "projectName" && value === "Non-Patang" ? { category: "DGT" } : {}),
    }));
  };

  const handleItemChange = (idx, e) => {
    const items = [...cart.items];
    items[idx] = { ...items[idx], [e.target.name]: e.target.value };
    setCart((p) => ({ ...p, items }));
  };

  const addItem = () => setCart((p) => ({ ...p, items: [...p.items, { ...emptyItem }] }));

  const removeItem = (idx) => {
    if (cart.items.length === 1) return;
    setCart((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  const openNew = () => {
    setEditingId(null);
    setCart(emptyCart);
    setSaveMsg(null);
    setView("editor");
  };

  const openDraft = (draft) => {
    setEditingId(draft.id);
    setCart({
      vendorSite:   draft.vendorSite   || "",
      orderLink:    draft.orderLink    || "",
      projectName:  draft.projectName  || "",
      category:     draft.category     || "",
      priority:     draft.priority     || "",
      notes:        draft.notes        || "",
      items:        draft.items?.length ? draft.items : [{ ...emptyItem }],
    });
    setSaveMsg(null);
    setView("editor");
  };

  const handleSaveDraft = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const id = await saveDraftOrder(cart, user.uid, user.email, editingId);
      setEditingId(id);
      setSaveMsg({ type: "success", text: "Draft saved." });
      fetchAll();
    } catch (err) {
      console.error(err);
      setSaveMsg({ type: "error", text: "Failed to save draft." });
    } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    // Validate required cart fields
    if (!cart.vendorSite || !cart.projectName || !cart.category || !cart.priority) {
      setSaveMsg({ type: "error", text: "Please fill in Vendor, Project, Category and Priority." }); return;
    }
    if (cart.items.some((i) => !i.name || !i.quantity || !i.type)) {
      setSaveMsg({ type: "error", text: "Each item needs a Name, Type and Quantity." }); return;
    }
    setSaving(true);
    try {
      // Save (creates doc if new, updates if existing draft) then submit
      const id = await saveDraftOrder(cart, user.uid, user.email, editingId);
      await submitOrderRequest(id);
      setSaveMsg({ type: "success", text: "Order submitted successfully!" });
      setTimeout(() => { setView("list"); fetchAll(); }, 1200);
    } catch (err) {
      console.error(err);
      setSaveMsg({ type: "error", text: "Failed to submit order." });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this draft?")) return;
    await deleteDraft(id);
    fetchAll();
  };

  // ── LIST VIEW ──────────────────────────────────────────────
  if (view === "list") return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 className="page-title">Order Requests</h2>
          <p className="page-subtitle">Submit order lists grouped by vendor / website</p>
        </div>
        <button className="btn-primary" style={{ width: "auto", marginTop: "0.25rem" }} onClick={openNew}>
          + New Order List
        </button>
      </div>

      {loading ? <div className="loading-screen" style={{ height: "150px" }}><div className="loading-spinner" /></div> : (
        <>
          {/* Drafts */}
          {drafts.length > 0 && (
            <div className="list-section">
              <h3 className="section-title">Drafts ({drafts.length})</h3>
              {drafts.map((d) => (
                <div key={d.id} className="order-card order-card--draft">
                  <div className="order-card-info">
                    <strong>{d.vendorSite || "Untitled Order"}</strong>
                    <span>{d.items?.length || 0} item{d.items?.length !== 1 ? "s" : ""}</span>
                    <span>{d.projectName || "—"}</span>
                    <span className="badge badge--warning">Draft</span>
                  </div>
                  <div className="order-card-actions">
                    <button className="btn-outline-sm" onClick={() => openDraft(d)}>Continue editing</button>
                    <button className="btn-danger-sm" onClick={() => handleDelete(d.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Submitted orders */}
          {orders.length > 0 && (
            <div className="list-section">
              <h3 className="section-title">Submitted Orders ({orders.length})</h3>
              {orders.map((o) => (
                <div key={o.id} className="order-card">
                  <div className="order-card-info">
                    <strong>{o.vendorSite || "—"}</strong>
                    <span>{o.items?.length || 0} item{o.items?.length !== 1 ? "s" : ""}</span>
                    <span>{o.projectName || "—"}</span>
                    <span>{o.category || "—"}</span>
                    <span className={`badge ${STATUS_STYLE[o.status]?.cls}`}>{STATUS_STYLE[o.status]?.label ?? o.status}</span>
                  </div>
                  <div className="order-card-meta">
                    {o.estimatedAmount && <span>Est. ₹{Number(o.estimatedAmount).toLocaleString("en-IN")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {drafts.length === 0 && orders.length === 0 && (
            <div className="empty-state"><p>No orders yet. Click "New Order List" to get started.</p></div>
          )}
        </>
      )}
    </div>
  );

  // ── EDITOR VIEW ────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 className="page-title">{editingId ? "Edit Order List" : "New Order List"}</h2>
          <p className="page-subtitle">All items from one vendor / website go in one list</p>
        </div>
        <button className="btn-secondary" style={{ width: "auto" }} onClick={() => setView("list")}>← Back</button>
      </div>

      {saveMsg && <div className={`alert alert--${saveMsg.type === "success" ? "success" : "error"}`}>{saveMsg.text}</div>}

      {/* Cart-level fields */}
      <div className="form-card" style={{ marginBottom: "1.25rem" }}>
        <p className="section-label">Order Details</p>
        <div className="form-grid">
          <div className="form-group">
            <label>Vendor / Website <span className="required">*</span></label>
            <input name="vendorSite" type="text" value={cart.vendorSite} onChange={handleCartChange} placeholder="e.g. Amazon, Mouser, IndiaMART" />
          </div>
          <div className="form-group">
            <label>Order Link (URL)</label>
            <input name="orderLink" type="url" value={cart.orderLink} onChange={handleCartChange} placeholder="https://..." />
          </div>
          <div className="form-group">
            <label>Project <span className="required">*</span></label>
            <select name="projectName" value={cart.projectName} onChange={handleCartChange}>
              <option value="">Select project...</option>
              {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Category <span className="required">*</span></label>
            <select name="category" value={cart.category} onChange={handleCartChange}
              disabled={cart.projectName === "Non-Patang"}>
              <option value="">Select category...</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {cart.projectName === "Non-Patang" && (
              <p className="field-hint">Auto-set to DGT for Non-Patang projects.</p>
            )}
          </div>
          <div className="form-group form-group--full">
            <label>Priority <span className="required">*</span></label>
            <select name="priority" value={cart.priority} onChange={handleCartChange}>
              <option value="">Select priority...</option>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group form-group--full">
            <label>Notes for Admin</label>
            <textarea name="notes" value={cart.notes} onChange={handleCartChange} rows={2} placeholder="Any context for the reviewer..." />
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="form-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <p className="section-label">Items ({cart.items.length})</p>
          <button type="button" className="btn-outline-sm" onClick={addItem}>+ Add Item</button>
        </div>

        {cart.items.map((item, idx) => (
          <div key={idx} className="cart-item-row">
            <div className="cart-item-number">{idx + 1}</div>
            <div className="cart-item-fields">
              <div className="form-group">
                <label>Item Name <span className="required">*</span></label>
                <input name="name" type="text" value={item.name} onChange={(e) => handleItemChange(idx, e)} placeholder="e.g. Resistor 10kΩ" />
              </div>
              <div className="form-group">
                <label>Type <span className="required">*</span></label>
                <select name="type" value={item.type} onChange={(e) => handleItemChange(idx, e)}>
                  <option value="">Select...</option>
                  {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Qty <span className="required">*</span></label>
                <input name="quantity" type="number" min="1" value={item.quantity} onChange={(e) => handleItemChange(idx, e)} placeholder="1" />
              </div>
              <div className="form-group">
                <label>Est. Amount (₹)</label>
                <input name="estimatedAmount" type="number" min="0" step="0.01" value={item.estimatedAmount} onChange={(e) => handleItemChange(idx, e)} placeholder="0.00" />
              </div>
              <div className="form-group cart-item-notes">
                <label>Item Notes</label>
                <input name="notes" type="text" value={item.notes} onChange={(e) => handleItemChange(idx, e)} placeholder="Optional spec / link..." />
              </div>
            </div>
            <button className="cart-item-remove" onClick={() => removeItem(idx)} disabled={cart.items.length === 1} title="Remove item">✕</button>
          </div>
        ))}

        <div className="cart-total-row">
          <span>Estimated Total</span>
          <strong>₹{cart.items.reduce((s, i) => s + (parseFloat(i.estimatedAmount) || 0) * (parseInt(i.quantity) || 1), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: "1.25rem" }}>
        <button className="btn-secondary" onClick={() => setView("list")}>Cancel</button>
        <button className="btn-secondary" onClick={handleSaveDraft} disabled={saving}>
          {saving ? "Saving..." : "💾 Save Draft"}
        </button>
        <button className="btn-primary" style={{ width: "auto" }} onClick={handleSubmit} disabled={saving}>
          {saving ? "Submitting..." : "Submit Order List →"}
        </button>
      </div>
    </div>
  );
}