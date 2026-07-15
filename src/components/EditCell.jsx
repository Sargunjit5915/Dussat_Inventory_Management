// src/components/EditCell.jsx — click-to-edit-in-place table cell
// Extracted from admin/ReviewFinances.jsx so it can be reused by other
// inline-editable admin tables (e.g. admin/VendorPipeline.jsx).

import { useState } from "react";

export default function EditCell({ value, type = "text", options = null, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value || "");
  const commit = async () => { setEditing(false); if (draft !== (value || "")) await onSave(draft); };
  if (!editing) return (
    <span className="editable-cell" onClick={() => { setDraft(value || ""); setEditing(true); }} title="Click to edit">
      {value || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>}
    </span>
  );
  if (options) return (
    <select className="inline-edit-input" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} autoFocus>
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return (
    <input className="inline-edit-input" type={type} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      autoFocus />
  );
}
