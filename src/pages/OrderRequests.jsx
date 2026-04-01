// src/pages/OrderRequests.jsx — Updated with Amount + Category fields

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { submitOrderRequest } from "../firebase/firestoreService";

const PRIORITY_LEVELS = [
  { value: "critical", label: "🔴 Critical — Needed immediately" },
  { value: "high",     label: "🟠 High — Needed within the week" },
  { value: "medium",   label: "🟡 Medium — Needed within the month" },
  { value: "low",      label: "🟢 Low — No urgency" },
];
const CATEGORIES = ["Grant","DGT","Consumable / Fab / Test","General"];

const emptyForm = { itemName:"", quantity:"", priority:"", category:"", estimatedAmount:"", suggestedVendor:"", orderLink:"", projectName:"", isGeneric:false, notes:"" };

export default function OrderRequests() {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "isGeneric" && checked ? { projectName: "" } : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await submitOrderRequest({
        itemName: form.itemName,
        quantity: parseInt(form.quantity, 10),
        priority: form.priority,
        category: form.category || null,
        estimatedAmount: form.estimatedAmount ? parseFloat(form.estimatedAmount) : null,
        suggestedVendor: form.suggestedVendor || null,
        orderLink: form.orderLink || null,
        projectName: form.isGeneric ? "Generic" : form.projectName,
        notes: form.notes || null,
      }, user.uid);
      setStatus("success");
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to submit request. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Order Requests</h2>
        <p className="page-subtitle">Submit a request for new items to be ordered</p>
      </div>
      {status === "success" && <div className="alert alert--success">✓ Order request submitted. An admin will review it shortly.</div>}
      {status === "error" && <div className="alert alert--error">{errorMsg}</div>}
      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="itemName">Item Name <span className="required">*</span></label>
            <input id="itemName" name="itemName" type="text" value={form.itemName} onChange={handleChange} placeholder="e.g. USB-C Hub 7-Port" required />
          </div>
          <div className="form-group">
            <label htmlFor="quantity">Quantity <span className="required">*</span></label>
            <input id="quantity" name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange} placeholder="1" required />
          </div>
          <div className="form-group">
            <label htmlFor="priority">Priority Level <span className="required">*</span></label>
            <select id="priority" name="priority" value={form.priority} onChange={handleChange} required>
              <option value="">Select priority...</option>
              {PRIORITY_LEVELS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="category">Category <span className="required">*</span></label>
            <select id="category" name="category" value={form.category} onChange={handleChange} required>
              <option value="">Select category...</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="estimatedAmount">Estimated Amount (₹)</label>
            <input id="estimatedAmount" name="estimatedAmount" type="number" min="0" step="0.01" value={form.estimatedAmount} onChange={handleChange} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label htmlFor="suggestedVendor">Suggested Vendor</label>
            <input id="suggestedVendor" name="suggestedVendor" type="text" value={form.suggestedVendor} onChange={handleChange} placeholder="e.g. Amazon, B&H Photo" />
          </div>
          <div className="form-group form-group--full">
            <label htmlFor="orderLink">Order Link (URL)</label>
            <input id="orderLink" name="orderLink" type="url" value={form.orderLink} onChange={handleChange} placeholder="https://..." />
          </div>
          <div className="form-group form-group--full">
            <label htmlFor="projectName">Project Name</label>
            <div className="input-with-toggle">
              <input id="projectName" name="projectName" type="text" value={form.isGeneric ? "" : form.projectName} onChange={handleChange} placeholder="Enter project name..." disabled={form.isGeneric} />
              <label className="toggle-label">
                <input type="checkbox" name="isGeneric" checked={form.isGeneric} onChange={handleChange} />
                <span className="toggle-text">Mark as Generic (not project-specific)</span>
              </label>
            </div>
          </div>
          <div className="form-group form-group--full">
            <label htmlFor="notes">Additional Notes</label>
            <textarea id="notes" name="notes" value={form.notes} onChange={handleChange} placeholder="Any additional context for the admin reviewing this request..." rows={3} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => setForm(emptyForm)}>Clear form</button>
          <button type="submit" className="btn-primary" disabled={status === "loading"}>{status === "loading" ? "Submitting..." : "Submit Request"}</button>
        </div>
      </form>
    </div>
  );
}