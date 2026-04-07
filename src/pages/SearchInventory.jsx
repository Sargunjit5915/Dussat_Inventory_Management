// src/pages/SearchInventory.jsx — v3: Mark Faulty + Fixed + Remove (Returnable)

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchInventoryByName, markItemFaulty } from "../firebase/firestoreService";
import { updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";

const FAULTY_CATEGORIES = [
  { value: "returnable", label: "Returnable",               desc: "Can be returned to vendor for refund/replacement" },
  { value: "fixable",    label: "Fixable",                  desc: "Can be repaired and returned to use" },
  { value: "ber",        label: "BER — Beyond Economic Repair", desc: "Cost of repair exceeds item value" },
];

const STATUS_LABELS = {
  active: { label: "Active", class: "badge--active" },
  faulty: { label: "Faulty", class: "badge--faulty" },
};

const FAULTY_LABELS = {
  returnable: { label: "Returnable", class: "badge--returnable" },
  fixable:    { label: "Fixable",    class: "badge--fixable"    },
  ber:        { label: "BER",        class: "badge--ber"        },
};

export default function SearchInventory() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [searched, setSearched]     = useState(false);

  // Mark faulty modal
  const [modalItem, setModalItem]         = useState(null);
  const [selectedCategory, setSelected]   = useState("");
  const [markingStatus, setMarkingStatus] = useState(null);

  // Confirm remove modal
  const [removeItem, setRemoveItem]   = useState(null);
  const [removing, setRemoving]       = useState(false);
  const [removeStatus, setRemoveStatus] = useState(null);

  // Inline action status per item
  const [actionStatus, setActionStatus] = useState({}); // { [id]: "loading"|"success"|"error" }

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true); setSearched(false);
    try {
      setResults(await searchInventoryByName(searchTerm));
    } catch (err) { console.error(err); }
    finally { setSearching(false); setSearched(true); }
  };

  // Mark faulty modal
  const openFaultyModal = (item) => {
    setModalItem(item); setSelected(""); setMarkingStatus(null);
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
    } catch (err) {
      console.error(err); setMarkingStatus("error");
    }
  };

  // Mark as Fixed (Fixable → back to Active)
  const handleMarkFixed = async (item) => {
    setActionStatus((p) => ({ ...p, [item.id]: "loading" }));
    try {
      await updateDoc(doc(db, "inventory", item.id), {
        status: "active",
        faultyCategory: null,
        markedFixedBy: user.uid,
      });
      setResults((prev) => prev.map((i) =>
        i.id === item.id ? { ...i, status: "active", faultyCategory: null } : i
      ));
      setActionStatus((p) => ({ ...p, [item.id]: "success" }));
      setTimeout(() => setActionStatus((p) => ({ ...p, [item.id]: null })), 2000);
    } catch (err) {
      console.error(err); setActionStatus((p) => ({ ...p, [item.id]: "error" }));
    }
  };

  // Remove item (Returnable → delete from inventory)
  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteDoc(doc(db, "inventory", removeItem.id));
      setResults((prev) => prev.filter((i) => i.id !== removeItem.id));
      setRemoveStatus("success");
      setTimeout(() => setRemoveItem(null), 800);
    } catch (err) {
      console.error(err); setRemoveStatus("error");
    } finally { setRemoving(false); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Search & Manage Inventory</h2>
        <p className="page-subtitle">Find items and update their status</p>
      </div>

      <form onSubmit={handleSearch} className="search-bar">
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by item name..." className="search-input" />
        <button type="submit" className="btn-primary" disabled={searching}>
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {searched && results.length === 0 && (
        <div className="empty-state"><p>No items found matching "<strong>{searchTerm}</strong>".</p></div>
      )}

      {results.length > 0 && (
        <div className="results-table-wrapper">
          <p className="results-count">{results.length} result{results.length !== 1 ? "s" : ""} found</p>
          <table className="results-table">
            <thead>
              <tr>
                <th>Name</th><th>Type</th><th>Qty</th><th>Location</th>
                <th>Vendor</th><th>Brand</th><th>Acquired</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr key={item.id}>
                  <td className="td-name">{item.name}</td>
                  <td>{item.type}</td>
                  <td>{item.quantity}</td>
                  <td>{item.storageLocation}</td>
                  <td>{item.vendor || "—"}</td>
                  <td>{item.companyBrand || "—"}</td>
                  <td>{item.dateOfAcquisition}</td>
                  <td>
                    <span className={`badge ${STATUS_LABELS[item.status]?.class}`}>
                      {STATUS_LABELS[item.status]?.label ?? item.status}
                    </span>
                    {item.status === "faulty" && item.faultyCategory && (
                      <span className={`badge badge--sm ${FAULTY_LABELS[item.faultyCategory]?.class}`}>
                        {FAULTY_LABELS[item.faultyCategory]?.label}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>

                      {/* Not faulty → can mark faulty */}
                      {item.status !== "faulty" && (
                        <button className="btn-danger-sm" onClick={() => openFaultyModal(item)}>
                          Mark Faulty
                        </button>
                      )}

                      {/* Fixable → show "Mark Fixed" button */}
                      {item.status === "faulty" && item.faultyCategory === "fixable" && (
                        <button
                          className="btn-outline-sm"
                          style={{ color: "var(--success)", borderColor: "rgba(46,204,113,0.4)" }}
                          onClick={() => handleMarkFixed(item)}
                          disabled={actionStatus[item.id] === "loading"}
                        >
                          {actionStatus[item.id] === "loading" ? "..." :
                           actionStatus[item.id] === "success" ? "✓ Fixed!" : "✓ Mark Fixed"}
                        </button>
                      )}

                      {/* Returnable → show "Remove Item" button */}
                      {item.status === "faulty" && item.faultyCategory === "returnable" && (
                        <button
                          className="btn-danger-sm"
                          onClick={() => { setRemoveItem(item); setRemoveStatus(null); }}
                        >
                          Remove Item
                        </button>
                      )}

                      {actionStatus[item.id] === "error" && (
                        <span style={{ fontSize: "0.7rem", color: "var(--danger)" }}>Error</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mark Faulty Modal ───────────────────────────────── */}
      {modalItem && (
        <div className="modal-overlay" onClick={() => setModalItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Mark as Faulty</h3>
              <button className="modal-close" onClick={() => setModalItem(null)}>✕</button>
            </div>
            <p className="modal-item-name">"{modalItem.name}"</p>
            <p className="modal-instructions">Select the fault category:</p>
            <div className="fault-options">
              {FAULTY_CATEGORIES.map((cat) => (
                <label key={cat.value}
                  className={`fault-option ${selectedCategory === cat.value ? "fault-option--selected" : ""}`}>
                  <input type="radio" name="faultyCategory" value={cat.value}
                    checked={selectedCategory === cat.value}
                    onChange={() => setSelected(cat.value)} />
                  <div>
                    <strong>{cat.label}</strong>
                    <p>{cat.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {markingStatus === "success" && <div className="alert alert--success">✓ Item marked as faulty.</div>}
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

      {/* ── Remove Item Confirm Modal ───────────────────────── */}
      {removeItem && (
        <div className="modal-overlay" onClick={() => setRemoveItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Item</h3>
              <button className="modal-close" onClick={() => setRemoveItem(null)}>✕</button>
            </div>
            <p className="modal-item-name">"{removeItem.name}"</p>
            <p className="modal-instructions" style={{ marginBottom: "1.25rem" }}>
              This item is marked <strong>Returnable</strong>. Removing it will permanently delete it from inventory.
              This cannot be undone.
            </p>
            {removeStatus === "error" && <div className="alert alert--error">Failed to remove. Try again.</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRemoveItem(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleRemove} disabled={removing}>
                {removing ? "Removing..." : "Yes, Remove from Inventory"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}