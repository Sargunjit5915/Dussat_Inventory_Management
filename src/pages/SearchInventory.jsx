// src/pages/SearchInventory.jsx — PV-based search

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchInventoryByName, markItemFaulty } from "../firebase/firestoreService";
import { updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";

const FAULTY_CATEGORIES = [
  { value: "returnable", label: "Returnable",                desc: "Can be returned to vendor for refund/replacement" },
  { value: "fixable",    label: "Fixable",                   desc: "Can be repaired and returned to use" },
  { value: "ber",        label: "BER — Beyond Economic Repair", desc: "Cost of repair exceeds item value" },
];

const STATUS_LABELS  = {
  active: { label: "Active", class: "badge--active" },
  faulty: { label: "Faulty", class: "badge--faulty" },
};
const FAULTY_LABELS = {
  returnable: { label: "Returnable", class: "badge--returnable" },
  fixable:    { label: "Fixable",    class: "badge--fixable"    },
  ber:        { label: "BER",        class: "badge--ber"        },
};
const fmt = (n) => n ? `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—";

export default function SearchInventory() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [searched, setSearched]     = useState(false);
  const [expanded, setExpanded]     = useState(null); // expanded PV id

  const [modalItem, setModalItem]         = useState(null);
  const [selectedCategory, setSelected]   = useState("");
  const [markingStatus, setMarkingStatus] = useState(null);

  const [removeItem, setRemoveItem]     = useState(null);
  const [removing, setRemoving]         = useState(false);
  const [removeStatus, setRemoveStatus] = useState(null);

  const [actionStatus, setActionStatus] = useState({});

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true); setSearched(false); setExpanded(null);
    try {
      const res = await searchInventoryByName(searchTerm);
      setResults(res);
      // Auto-expand if only one result
      if (res.length === 1) setExpanded(res[0].id);
    } catch (err) { console.error(err); }
    finally { setSearching(false); setSearched(true); }
  };

  const openFaultyModal = (pv) => {
    setModalItem(pv); setSelected(""); setMarkingStatus(null);
  };

  const handleMarkFaulty = async () => {
    if (!selectedCategory) return;
    setMarkingStatus("loading");
    try {
      await markItemFaulty(modalItem.id, selectedCategory, user.uid);
      setResults((prev) => prev.map((i) =>
        i.id === modalItem.id ? { ...i, status: "faulty", faultyCategory: selectedCategory } : i
      ));
      setMarkingStatus("success");
      setTimeout(() => setModalItem(null), 1000);
    } catch (err) { console.error(err); setMarkingStatus("error"); }
  };

  const handleMarkFixed = async (pv) => {
    setActionStatus((p) => ({ ...p, [pv.id]: "loading" }));
    try {
      await updateDoc(doc(db, "inventory", pv.id), {
        status: "active", faultyCategory: null, markedFixedBy: user.uid,
      });
      setResults((prev) => prev.map((i) =>
        i.id === pv.id ? { ...i, status: "active", faultyCategory: null } : i
      ));
      setActionStatus((p) => ({ ...p, [pv.id]: "success" }));
      setTimeout(() => setActionStatus((p) => ({ ...p, [pv.id]: null })), 2000);
    } catch (err) { setActionStatus((p) => ({ ...p, [pv.id]: "error" })); }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteDoc(doc(db, "inventory", removeItem.id));
      setResults((prev) => prev.filter((i) => i.id !== removeItem.id));
      setRemoveStatus("success");
      setTimeout(() => setRemoveItem(null), 800);
    } catch (err) { setRemoveStatus("error"); }
    finally { setRemoving(false); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Search & Manage Inventory</h2>
        <p className="page-subtitle">Search by item name, vendor, or PV number — click any result to expand</p>
      </div>

      <form onSubmit={handleSearch} className="search-bar">
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by item name, vendor, or PV number..." className="search-input" />
        <button type="submit" className="btn-primary" disabled={searching}>
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {searched && results.length === 0 && (
        <div className="empty-state"><p>No PVs or items found matching "<strong>{searchTerm}</strong>".</p></div>
      )}

      {results.length > 0 && (
        <div>
          <p className="results-count">{results.length} PV{results.length !== 1 ? "s" : ""} found</p>

          {results.map((pv) => (
            <div key={pv.id} className={`order-status-card ${pv.status === "faulty" ? "" : ""}`}
              style={{ marginBottom: "0.75rem" }}>

              {/* PV Header row */}
              <div className="order-status-header" onClick={() => setExpanded(expanded === pv.id ? null : pv.id)}>
                <div className="order-status-meta">
                  {/* PV number badge */}
                  <span className="pv-number-badge">PV {pv.pvNumber || "—"}</span>
                  <strong className="order-status-vendor">{pv.description || "—"}</strong>
                  <span>{pv.date || "—"}</span>
                  <span>{pv.type || "—"}</span>
                  <span className={`badge ${pv.category === "Grant" ? "badge--active" : "badge--returnable"}`}>
                    {pv.category || "—"}
                  </span>
                  <span>{pv.projectName || "—"}</span>
                  {pv.payee && <span style={{ fontSize:"0.7rem", color:"var(--text-muted)" }}>👤 {pv.payee}</span>}
                  <span className={`badge ${STATUS_LABELS[pv.status]?.class}`}>
                    {STATUS_LABELS[pv.status]?.label ?? pv.status}
                  </span>
                  {pv.status === "faulty" && pv.faultyCategory && (
                    <span className={`badge badge--sm ${FAULTY_LABELS[pv.faultyCategory]?.class}`}>
                      {FAULTY_LABELS[pv.faultyCategory]?.label}
                    </span>
                  )}
                </div>

                <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                  {pv.amount && (
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.8rem", color:"var(--accent)" }}>
                      {fmt(pv.amount)}
                    </span>
                  )}
                  <span className="expand-toggle">{expanded === pv.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded: items table + actions */}
              {expanded === pv.id && (
                <div className="order-status-body">

                  {/* Items table */}
                  {pv.items?.length > 0 && (
                    <table className="results-table" style={{ marginBottom:"1rem" }}>
                      <thead>
                        <tr><th>#</th><th>Item</th><th>Qty</th><th>Storage Location</th><th>Notes</th></tr>
                      </thead>
                      <tbody>
                        {pv.items.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ fontFamily:"var(--font-mono)", fontSize:"0.7rem", color:"var(--text-muted)" }}>{idx+1}</td>
                            <td className="td-name">{item.name}</td>
                            <td>{item.quantity}</td>
                            <td>{item.storageLocation || "—"}</td>
                            <td style={{ color:"var(--text-muted)", fontSize:"0.8rem" }}>{item.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* PV meta */}
                  <div className="order-summary-grid" style={{ marginBottom:"1rem" }}>
                    {pv.payee  && <div className="summary-item"><span>Payee</span><strong>{pv.payee}</strong></div>}
                    {pv.amount && <div className="summary-item"><span>Amount</span><strong>{fmt(pv.amount)}</strong></div>}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
                    {pv.status !== "faulty" && (
                      <button className="btn-danger-sm" onClick={() => openFaultyModal(pv)}>
                        Mark Faulty
                      </button>
                    )}
                    {pv.status === "faulty" && pv.faultyCategory === "fixable" && (
                      <button className="btn-outline-sm"
                        style={{ color:"var(--success)", borderColor:"rgba(46,204,113,0.4)" }}
                        onClick={() => handleMarkFixed(pv)}
                        disabled={actionStatus[pv.id] === "loading"}>
                        {actionStatus[pv.id] === "loading" ? "..." :
                         actionStatus[pv.id] === "success" ? "✓ Fixed!" : "✓ Mark Fixed"}
                      </button>
                    )}
                    {pv.status === "faulty" && pv.faultyCategory === "returnable" && (
                      <button className="btn-danger-sm"
                        onClick={() => { setRemoveItem(pv); setRemoveStatus(null); }}>
                        Remove PV
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mark Faulty Modal */}
      {modalItem && (
        <div className="modal-overlay" onClick={() => setModalItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Mark PV as Faulty</h3>
              <button className="modal-close" onClick={() => setModalItem(null)}>✕</button>
            </div>
            <p className="modal-item-name">PV {modalItem.pvNumber} — "{modalItem.description}"</p>
            <p className="modal-instructions">Select the fault category:</p>
            <div className="fault-options">
              {FAULTY_CATEGORIES.map((cat) => (
                <label key={cat.value}
                  className={`fault-option ${selectedCategory === cat.value ? "fault-option--selected" : ""}`}>
                  <input type="radio" name="faultyCategory" value={cat.value}
                    checked={selectedCategory === cat.value}
                    onChange={() => setSelected(cat.value)} />
                  <div><strong>{cat.label}</strong><p>{cat.desc}</p></div>
                </label>
              ))}
            </div>
            {markingStatus === "success" && <div className="alert alert--success">✓ PV marked as faulty.</div>}
            {markingStatus === "error"   && <div className="alert alert--error">Failed to update. Try again.</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setModalItem(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleMarkFaulty}
                disabled={!selectedCategory || markingStatus === "loading"}>
                {markingStatus === "loading" ? "Saving..." : "Confirm — Mark Faulty"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove PV Confirm Modal */}
      {removeItem && (
        <div className="modal-overlay" onClick={() => setRemoveItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove PV</h3>
              <button className="modal-close" onClick={() => setRemoveItem(null)}>✕</button>
            </div>
            <p className="modal-item-name">PV {removeItem.pvNumber} — "{removeItem.description}"</p>
            <p className="modal-instructions" style={{ marginBottom:"1.25rem" }}>
              This PV is marked <strong>Returnable</strong>. Removing it will permanently delete it and all its items from inventory. This cannot be undone.
            </p>
            {removeStatus === "error" && <div className="alert alert--error">Failed to remove. Try again.</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRemoveItem(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleRemove} disabled={removing}>
                {removing ? "Removing..." : "Yes, Remove PV from Inventory"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}