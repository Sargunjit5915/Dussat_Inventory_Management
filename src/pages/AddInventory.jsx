// src/pages/AddInventory.jsx — v3: updated types/categories

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { addInventoryItem, ITEM_TYPES, CATEGORIES } from "../firebase/firestoreService";

const emptyForm = {
  name: "", type: "", category: "", quantity: "",
  storageLocation: "", vendor: "", companyBrand: "",
  dateOfAcquisition: "", amount: "",
};

export default function AddInventory() {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading"); setErrorMsg("");
    try {
      await addInventoryItem({
        ...form,
        quantity: parseInt(form.quantity, 10),
        amount: form.amount ? parseFloat(form.amount) : null,
        nameLower: form.name.toLowerCase().trim(),
      }, user.uid);
      setStatus("success");
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to add item. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Add Inventory</h2>
        <p className="page-subtitle">Register a new item into the inventory system</p>
      </div>
      {status === "success" && <div className="alert alert--success">✓ Item successfully added to inventory.</div>}
      {status === "error"   && <div className="alert alert--error">{errorMsg}</div>}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid">
          <div className="form-group">
            <label>Item Name <span className="required">*</span></label>
            <input name="name" type="text" value={form.name} onChange={handleChange} placeholder="e.g. Oscilloscope 100MHz" required />
          </div>
          <div className="form-group">
            <label>Type <span className="required">*</span></label>
            <select name="type" value={form.type} onChange={handleChange} required>
              <option value="">Select type...</option>
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Category <span className="required">*</span></label>
            <select name="category" value={form.category} onChange={handleChange} required>
              <option value="">Select category...</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Amount (₹)</label>
            <input name="amount" type="number" min="0" step="0.01" value={form.amount} onChange={handleChange} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label>Quantity <span className="required">*</span></label>
            <input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange} placeholder="1" required />
          </div>
          <div className="form-group">
            <label>Storage Location <span className="required">*</span></label>
            <input name="storageLocation" type="text" value={form.storageLocation} onChange={handleChange} placeholder="e.g. Cupboard A3 / Rack 12" required />
          </div>
          <div className="form-group">
            <label>Vendor</label>
            <input name="vendor" type="text" value={form.vendor} onChange={handleChange} placeholder="Where was this purchased?" />
          </div>
          <div className="form-group">
            <label>Company / Brand</label>
            <input name="companyBrand" type="text" value={form.companyBrand} onChange={handleChange} placeholder="e.g. Dell, 3M, Tektronix" />
          </div>
          <div className="form-group form-group--full">
            <label>Date of Acquisition <span className="required">*</span></label>
            <input name="dateOfAcquisition" type="date" value={form.dateOfAcquisition} onChange={handleChange} required />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => setForm(emptyForm)}>Clear form</button>
          <button type="submit" className="btn-primary" disabled={status === "loading"}>
            {status === "loading" ? "Adding..." : "Add to Inventory"}
          </button>
        </div>
      </form>
    </div>
  );
}