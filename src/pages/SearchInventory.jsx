// src/pages/SearchInventory.jsx
// Page B: Search inventory by name, view results, mark items as faulty.

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchInventoryByName, markItemFaulty } from "../firebase/firestoreService";

const FAULTY_CATEGORIES = [
  { value: "returnable", label: "Returnable", desc: "Can be returned to vendor for refund/replacement" },
  { value: "fixable", label: "Fixable", desc: "Can be repaired and returned to use" },
  { value: "ber", label: "BER — Beyond Economic Repair", desc: "Cost of repair exceeds item value" },
];

const STATUS_LABELS = {
  active: { label: "Active", class: "badge--active" },
  faulty: { label: "Faulty", class: "badge--faulty" },
};

const FAULTY_LABELS = {
  returnable: { label: "Returnable", class: "badge--returnable" },
  fixable: { label: "Fixable", class: "badge--fixable" },
  ber: { label: "BER", class: "badge--ber" },
};

export default function SearchInventory() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Modal state for marking faulty
  const [modalItem, setModalItem] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [markingStatus, setMarkingStatus] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const items = await searchInventoryByName(searchTerm);
      setResults(items);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const openFaultyModal = (item) => {
    setModalItem(item);
    setSelectedCategory("");
    setMarkingStatus(null);
  };

  const handleMarkFaulty = async () => {
    if (!selectedCategory) return;
    setMarkingStatus("loading");
    try {
      await markItemFaulty(modalItem.id, selectedCategory, user.uid);
      // Update local results list
      setResults((prev) =>
        prev.map((item) =>
          item.id === modalItem.id
            ? { ...item, status: "faulty", faultyCategory: selectedCategory }
            : item
        )
      );
      setMarkingStatus("success");
      setTimeout(() => setModalItem(null), 1200);
    } catch (err) {
      console.error(err);
      setMarkingStatus("error");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Search & Manage Inventory</h2>
        <p className="page-subtitle">Find items and update their status</p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by item name..."
          className="search-input"
        />
        <button type="submit" className="btn-primary" disabled={searching}>
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Results */}
      {searched && results.length === 0 && (
        <div className="empty-state">
          <p>No items found matching "<strong>{searchTerm}</strong>".</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="results-table-wrapper">
          <p className="results-count">{results.length} result{results.length !== 1 ? "s" : ""} found</p>
          <table className="results-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Location</th>
                <th>Vendor</th>
                <th>Brand</th>
                <th>Acquired</th>
                <th>Status</th>
                <th>Actions</th>
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
                    {item.status !== "faulty" && (
                      <button
                        className="btn-danger-sm"
                        onClick={() => openFaultyModal(item)}
                      >
                        Mark Faulty
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark Faulty Modal */}
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
                <label
                  key={cat.value}
                  className={`fault-option ${selectedCategory === cat.value ? "fault-option--selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="faultyCategory"
                    value={cat.value}
                    checked={selectedCategory === cat.value}
                    onChange={() => setSelectedCategory(cat.value)}
                  />
                  <div>
                    <strong>{cat.label}</strong>
                    <p>{cat.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {markingStatus === "success" && (
              <div className="alert alert--success">✓ Item marked as faulty.</div>
            )}
            {markingStatus === "error" && (
              <div className="alert alert--error">Failed to update. Try again.</div>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setModalItem(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleMarkFaulty}
                disabled={!selectedCategory || markingStatus === "loading"}
              >
                {markingStatus === "loading" ? "Saving..." : "Confirm — Mark Faulty"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
