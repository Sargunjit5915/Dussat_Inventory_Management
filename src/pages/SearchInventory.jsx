// src/pages/SearchInventory.jsx — v4: per-item faulty/fixed/remove actions

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchInventoryByName } from "../firebase/firestoreService";
import { updateDoc, deleteDoc, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

const FAULTY_CATEGORIES = [
  { value: "returnable", label: "Returnable",                desc: "Can be returned to vendor for refund/replacement" },
  { value: "fixable",    label: "Fixable",                   desc: "Can be repaired and returned to use" },
  { value: "ber",        label: "BER — Beyond Economic Repair", desc: "Cost of repair exceeds item value" },
];

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
  const [expanded, setExpanded]     = useState(null);

  // Modal state — now tracks { pvId, itemIdx, itemName } instead of whole PV
  const [faultyModal, setFaultyModal]   = useState(null); // { pvId, itemIdx, itemName }
  const [selectedCat, setSelectedCat]   = useState("");
  const [markingStatus, setMarkingStatus] = useState(null);

  // Remove item modal
  const [removeTarget, setRemoveTarget] = useState(null); // { pvId, pvDoc, itemIdx }
  const [removing, setRemoving]         = useState(false);
  const [removeStatus, setRemoveStatus] = useState(null);

  // Per-item action feedback
  const [actionStatus, setActionStatus] = useState({}); // { "pvId_itemIdx": "loading"|"success"|"error" }

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true); setSearched(false); setExpanded(null);
    try { setResults(await searchInventoryByName(searchTerm)); }
    catch (err) { console.error(err); }
    finally { setSearching(false); setSearched(true); }
  };

  // Helper: update a specific item inside pv.items[] in Firestore and local state
  const patchItem = async (pvId, itemIdx, patch) => {
    const snap = await getDoc(doc(db, "inventory", pvId));
    if (!snap.exists()) return;
    const items = [...snap.data().items];
    items[itemIdx] = { ...items[itemIdx], ...patch };
    await updateDoc(doc(db, "inventory", pvId), { items });
    // Update local results
    setResults((prev) => prev.map((pv) =>
      pv.id === pvId ? { ...pv, items } : pv
    ));
  };

  // Open mark faulty modal for a specific item
  const openFaultyModal = (pvId, itemIdx, itemName) => {
    setFaultyModal({ pvId, itemIdx, itemName });
    setSelectedCat(""); setMarkingStatus(null);
  };

  const handleMarkFaulty = async () => {
    if (!selectedCat || !faultyModal) return;
    setMarkingStatus("loading");
    try {
      await patchItem(faultyModal.pvId, faultyModal.itemIdx, {
        faultyStatus:   "faulty",
        faultyCategory: selectedCat,
        markedFaultyBy: user.uid,
      });
      setMarkingStatus("success");
      setTimeout(() => setFaultyModal(null), 1000);
    } catch (err) { console.error(err); setMarkingStatus("error"); }
  };

  // Mark item as fixed — restore to active
  const handleMarkFixed = async (pvId, itemIdx) => {
    const key = `${pvId}_${itemIdx}`;
    setActionStatus((p) => ({ ...p, [key]: "loading" }));
    try {
      await patchItem(pvId, itemIdx, { faultyStatus: "active", faultyCategory: null });
      setActionStatus((p) => ({ ...p, [key]: "success" }));
      setTimeout(() => setActionStatus((p) => ({ ...p, [key]: null })), 2000);
    } catch (err) { setActionStatus((p) => ({ ...p, [key]: "error" })); }
  };

  // Remove a single item from a PV's items[]
  // If it's the last item, delete the whole PV document
  const openRemoveModal = (pv, itemIdx) => {
    setRemoveTarget({ pvId: pv.id, pv, itemIdx });
    setRemoveStatus(null);
  };

  const handleRemoveItem = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const { pvId, pv, itemIdx } = removeTarget;
      if (pv.items.length === 1) {
        // Only item — delete whole PV document
        await deleteDoc(doc(db, "inventory", pvId));
        setResults((prev) => prev.filter((p) => p.id !== pvId));
      } else {
        // Remove just this item from the array
        const snap = await getDoc(doc(db, "inventory", pvId));
        if (!snap.exists()) return;
        const items = snap.data().items.filter((_, i) => i !== itemIdx);
        await updateDoc(doc(db, "inventory", pvId), { items });
        setResults((prev) => prev.map((p) => p.id === pvId ? { ...p, items } : p));
      }
      setRemoveStatus("success");
      setTimeout(() => setRemoveTarget(null), 800);
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
        <div className="empty-state"><p>No items found matching "<strong>{searchTerm}</strong>".</p></div>
      )}

      {results.length > 0 && (
        <div>
          <p className="results-count">{results.length} PV{results.length !== 1 ? "s" : ""} found</p>

          {results.map((pv) => (
            <div key={pv.id} style={{ marginBottom: "0.75rem" }} className="order-status-card">

              {/* PV header */}
              <div className="order-status-header" onClick={() => setExpanded(expanded === pv.id ? null : pv.id)}>
                <div className="order-status-meta">
                  <span className="pv-number-badge">PV {pv.pvNumber || "—"}</span>
                  <strong className="order-status-vendor">{pv.description || "—"}</strong>
                  <span>{pv.date || "—"}</span>
                  <span>{pv.type || "—"}</span>
                  <span className={`badge ${pv.category === "Grant" ? "badge--active" : "badge--returnable"}`}>
                    {pv.category || "—"}
                  </span>
                  <span>{pv.projectName || "—"}</span>
                  {pv.payee && <span style={{ fontSize:"0.7rem", color:"var(--text-muted)" }}>👤 {pv.payee}</span>}
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

              {/* Expanded: per-item rows with actions */}
              {expanded === pv.id && (
                <div className="order-status-body">
                  {pv.items?.length > 0 ? (
                    <table className="results-table" style={{ marginBottom:"1rem" }}>
                      <thead>
                        <tr>
                          <th>#</th><th>Item</th><th>Qty</th>
                          <th>Storage Location</th><th>Notes</th>
                          <th>Status</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pv.items.map((item, idx) => {
                          const key      = `${pv.id}_${idx}`;
                          const isFaulty = item.faultyStatus === "faulty";
                          const cat      = item.faultyCategory;
                          return (
                            <tr key={idx} style={{ opacity: isFaulty ? 0.85 : 1 }}>
                              <td style={{ fontFamily:"var(--font-mono)", fontSize:"0.7rem", color:"var(--text-muted)" }}>{idx+1}</td>
                              <td className="td-name">{item.name}</td>
                              <td>{item.quantity}</td>
                              <td>{item.storageLocation || "—"}</td>
                              <td style={{ color:"var(--text-muted)", fontSize:"0.8rem" }}>{item.notes || "—"}</td>
                              <td>
                                {isFaulty ? (
                                  <div style={{ display:"flex", gap:"0.3rem", flexWrap:"wrap" }}>
                                    <span className="badge badge--faulty">Faulty</span>
                                    {cat && <span className={`badge badge--sm ${FAULTY_LABELS[cat]?.class}`}>{FAULTY_LABELS[cat]?.label}</span>}
                                  </div>
                                ) : (
                                  <span className="badge badge--active">Active</span>
                                )}
                              </td>
                              <td>
                                <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
                                  {/* Not faulty → can mark faulty */}
                                  {!isFaulty && (
                                    <button className="btn-danger-sm"
                                      onClick={() => openFaultyModal(pv.id, idx, item.name)}>
                                      Mark Faulty
                                    </button>
                                  )}
                                  {/* Fixable → mark fixed */}
                                  {isFaulty && cat === "fixable" && (
                                    <button className="btn-outline-sm"
                                      style={{ color:"var(--success)", borderColor:"rgba(46,204,113,0.4)" }}
                                      onClick={() => handleMarkFixed(pv.id, idx)}
                                      disabled={actionStatus[key] === "loading"}>
                                      {actionStatus[key] === "loading" ? "..." :
                                       actionStatus[key] === "success" ? "✓ Fixed!" : "✓ Mark Fixed"}
                                    </button>
                                  )}
                                  {/* Returnable → remove item */}
                                  {isFaulty && cat === "returnable" && (
                                    <button className="btn-danger-sm"
                                      onClick={() => openRemoveModal(pv, idx)}>
                                      Remove Item
                                    </button>
                                  )}
                                  {actionStatus[key] === "error" && (
                                    <span style={{ fontSize:"0.7rem", color:"var(--danger)" }}>Error</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ color:"var(--text-muted)", fontSize:"0.8rem", marginBottom:"1rem" }}>No items listed.</p>
                  )}

                  {/* PV meta footer */}
                  <div className="order-summary-grid">
                    {pv.payee  && <div className="summary-item"><span>Payee</span><strong>{pv.payee}</strong></div>}
                    {pv.amount && <div className="summary-item"><span>Amount</span><strong>{fmt(pv.amount)}</strong></div>}
                    {pv.gstAmount && <div className="summary-item"><span>GST</span><strong>{fmt(pv.gstAmount)}</strong></div>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Mark Faulty Modal ───────────────────────────── */}
      {faultyModal && (
        <div className="modal-overlay" onClick={() => setFaultyModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Mark Item as Faulty</h3>
              <button className="modal-close" onClick={() => setFaultyModal(null)}>✕</button>
            </div>
            <p className="modal-item-name">"{faultyModal.itemName}"</p>
            <p className="modal-instructions">Select the fault category:</p>
            <div className="fault-options">
              {FAULTY_CATEGORIES.map((cat) => (
                <label key={cat.value}
                  className={`fault-option ${selectedCat === cat.value ? "fault-option--selected" : ""}`}>
                  <input type="radio" name="faultyCategory" value={cat.value}
                    checked={selectedCat === cat.value}
                    onChange={() => setSelectedCat(cat.value)} />
                  <div><strong>{cat.label}</strong><p>{cat.desc}</p></div>
                </label>
              ))}
            </div>
            {markingStatus === "success" && <div className="alert alert--success">✓ Item marked as faulty.</div>}
            {markingStatus === "error"   && <div className="alert alert--error">Failed to update. Try again.</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setFaultyModal(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleMarkFaulty}
                disabled={!selectedCat || markingStatus === "loading"}>
                {markingStatus === "loading" ? "Saving..." : "Confirm — Mark Faulty"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Item Confirm Modal ───────────────────── */}
      {removeTarget && (
        <div className="modal-overlay" onClick={() => setRemoveTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Item</h3>
              <button className="modal-close" onClick={() => setRemoveTarget(null)}>✕</button>
            </div>
            <p className="modal-item-name">
              "{removeTarget.pv.items[removeTarget.itemIdx]?.name}"
            </p>
            <p className="modal-instructions" style={{ marginBottom:"1.25rem" }}>
              This item is marked <strong>Returnable</strong>. Removing it will permanently delete it from this PV.
              {removeTarget.pv.items.length === 1 && (
                <span style={{ color:"var(--danger)", display:"block", marginTop:"0.5rem" }}>
                  This is the only item — the entire PV will be deleted.
                </span>
              )}
            </p>
            {removeStatus === "error" && <div className="alert alert--error">Failed to remove. Try again.</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRemoveTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleRemoveItem} disabled={removing}>
                {removing ? "Removing..." : "Yes, Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}