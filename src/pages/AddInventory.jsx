// src/pages/AddInventory.jsx — PV-based inventory entry

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { addInventoryItem, ITEM_TYPES, CATEGORIES, PROJECTS, ORDER_MADE_BY } from "../firebase/firestoreService";

const emptyItem = { name: "", quantity: "", storageLocation: "", notes: "" };

const emptyForm = {
  pvNumber:        "",
  date:            "",
  description:     "",   // vendor / what was bought
  type:            "",
  category:        "",
  projectName:     "",
  amount:          "",
  payee:           "",
  items:           [{ ...emptyItem }],
};

export default function AddInventory() {
  const { user } = useAuth();
  const [form, setForm]     = useState(emptyForm);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // PV-level field change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({
      ...p,
      [name]: value,
      // Non-Patang → auto DGT
      ...(name === "projectName" && value === "Non-Patang" ? { category: "DGT" } : {}),
    }));
  };

  // Item row change
  const handleItemChange = (idx, e) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [e.target.name]: e.target.value };
    setForm((p) => ({ ...p, items }));
  };

  const addItem = () =>
    setForm((p) => ({ ...p, items: [...p.items, { ...emptyItem }] }));

  const removeItem = (idx) => {
    if (form.items.length === 1) return;
    setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading"); setErrorMsg("");

    // Validate at least one item has a name
    if (form.items.every((i) => !i.name.trim())) {
      setErrorMsg("Please add at least one item with a name.");
      setStatus("error"); return;
    }

    try {
      await addInventoryItem({
        pvNumber:        form.pvNumber.trim(),
        date:            form.date,
        description:     form.description.trim(),
        descriptionLower: form.description.toLowerCase().trim(),
        type:            form.type,
        category:        form.category,
        projectName:     form.projectName,
        amount:          form.amount ? parseFloat(form.amount) : null,
        payee:           form.payee,
        items:           form.items
                           .filter((i) => i.name.trim())
                           .map((i) => ({
                             name:            i.name.trim(),
                             quantity:        parseInt(i.quantity) || 1,
                             storageLocation: i.storageLocation.trim(),
                             notes:           i.notes.trim(),
                           })),
      }, user.uid);

      setStatus("success");
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to add PV. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Add Inventory</h2>
        <p className="page-subtitle">Enter a Purchase Voucher — all items under one PV go in one entry</p>
      </div>

      {status === "success" && (
        <div className="alert alert--success">✓ PV added to inventory successfully.</div>
      )}
      {status === "error" && (
        <div className="alert alert--error">{errorMsg}</div>
      )}

      <form onSubmit={handleSubmit}>

        {/* ── PV Details ─────────────────────────────────── */}
        <div className="form-card" style={{ marginBottom: "1.25rem" }}>
          <p className="section-label">Purchase Voucher Details</p>
          <div className="form-grid">

            <div className="form-group">
              <label>PV Number <span className="required">*</span></label>
              <input name="pvNumber" type="text" value={form.pvNumber}
                onChange={handleChange} placeholder="e.g. 311" required />
            </div>

            <div className="form-group">
              <label>Date <span className="required">*</span></label>
              <input name="date" type="date" value={form.date}
                onChange={handleChange} required />
            </div>

            <div className="form-group form-group--full">
              <label>Description / Vendor <span className="required">*</span></label>
              <input name="description" type="text" value={form.description}
                onChange={handleChange}
                placeholder="e.g. Robu.in — Electronic components" required />
            </div>

            <div className="form-group">
              <label>Type (Heads) <span className="required">*</span></label>
              <select name="type" value={form.type} onChange={handleChange} required>
                <option value="">Select type...</option>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Project <span className="required">*</span></label>
              <select name="projectName" value={form.projectName} onChange={handleChange} required>
                <option value="">Select project...</option>
                {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Category (A/c) <span className="required">*</span></label>
              <select name="category" value={form.category} onChange={handleChange}
                disabled={form.projectName === "Non-Patang"} required>
                <option value="">Select category...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {form.projectName === "Non-Patang" && (
                <p className="field-hint">Auto-set to DGT for Non-Patang projects.</p>
              )}
            </div>

            <div className="form-group">
              <label>Amount (₹) <span className="required">*</span></label>
              <input name="amount" type="number" min="0" step="0.01"
                value={form.amount} onChange={handleChange}
                placeholder="0.00" required />
            </div>

            <div className="form-group">
              <label>Payee <span className="required">*</span></label>
              <select name="payee" value={form.payee} onChange={handleChange} required>
                <option value="">Select payee...</option>
                {ORDER_MADE_BY.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

          </div>
        </div>

        {/* ── Items in this PV ───────────────────────────── */}
        <div className="form-card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
            <p className="section-label">Items in this PV ({form.items.length})</p>
            <button type="button" className="btn-outline-sm" onClick={addItem}>+ Add Item</button>
          </div>

          {form.items.map((item, idx) => (
            <div key={idx} className="cart-item-row">
              <div className="cart-item-number">{idx + 1}</div>
              <div className="pv-item-fields">
                <div className="form-group">
                  <label>Item Name <span className="required">*</span></label>
                  <input name="name" type="text" value={item.name}
                    onChange={(e) => handleItemChange(idx, e)}
                    placeholder="e.g. Raspberry Pi 5 8GB" />
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input name="quantity" type="number" min="1" value={item.quantity}
                    onChange={(e) => handleItemChange(idx, e)} placeholder="1" />
                </div>
                <div className="form-group">
                  <label>Storage Location</label>
                  <input name="storageLocation" type="text" value={item.storageLocation}
                    onChange={(e) => handleItemChange(idx, e)}
                    placeholder="e.g. Cupboard A3 / Rack 12" />
                </div>
                <div className="form-group pv-item-notes">
                  <label>Notes / Spec</label>
                  <input name="notes" type="text" value={item.notes}
                    onChange={(e) => handleItemChange(idx, e)}
                    placeholder="Optional — model no., spec, link..." />
                </div>
              </div>
              <button type="button" className="cart-item-remove"
                onClick={() => removeItem(idx)}
                disabled={form.items.length === 1} title="Remove item">
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="form-actions" style={{ marginTop:"1.25rem" }}>
          <button type="button" className="btn-secondary"
            onClick={() => setForm(emptyForm)}>
            Clear form
          </button>
          <button type="submit" className="btn-primary"
            disabled={status === "loading"}>
            {status === "loading" ? "Saving..." : "Add PV to Inventory"}
          </button>
        </div>
      </form>
    </div>
  );
}