// src/admin/ReviewFinances.jsx — v3 updated: inline editing + project name column

import { useState, useEffect, useMemo } from "react";
import { getAllInventory, getAllOrderRequests } from "../firebase/firestoreService";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { CATEGORIES, ITEM_TYPES } from "../firebase/firestoreService";

const ALL_CATS = ["All", ...CATEGORIES];
const fmt = (n) => `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Inline editable cell
function EditCell({ value, type = "text", options = null, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value || "");

  const commit = async () => {
    setEditing(false);
    if (draft !== (value || "")) await onSave(draft);
  };

  if (!editing) return (
    <span
      className="editable-cell"
      onClick={() => { setDraft(value || ""); setEditing(true); }}
      title="Click to edit"
    >
      {value || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>}
    </span>
  );

  if (options) return (
    <select
      className="inline-edit-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      autoFocus
    >
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <input
      className="inline-edit-input"
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      autoFocus
    />
  );
}

export default function ReviewFinances() {
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [catFilter, setCatFilter] = useState("All");
  const [activeTab, setActiveTab] = useState("instock");
  const [saving, setSaving]       = useState({});

  useEffect(() => {
    Promise.all([getAllInventory(), getAllOrderRequests()]).then(([inv, ord]) => {
      setInventory(inv);
      setOrders(ord);
      setLoading(false);
    });
  }, []);

  // Save a single field on an inventory item
  const saveInventoryField = async (itemId, field, value) => {
    setSaving((p) => ({ ...p, [itemId]: true }));
    try {
      await updateDoc(doc(db, "inventory", itemId), { [field]: value });
      setInventory((prev) =>
        prev.map((i) => i.id === itemId ? { ...i, [field]: value } : i)
      );
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving((p) => ({ ...p, [itemId]: false }));
    }
  };

  const inStock = useMemo(() =>
    inventory.filter((i) => catFilter === "All" || i.category === catFilter),
    [inventory, catFilter]
  );

  const yetToArrive = useMemo(() =>
    orders.filter((o) =>
      (o.status === "approved" || o.status === "completed") &&
      (catFilter === "All" || (o.adminCategory || o.category) === catFilter)
    ),
    [orders, catFilter]
  );

  const totals = useMemo(() => {
    const stockValue    = inventory.reduce((s, i) => s + (i.amount || 0), 0);
    const arrivingValue = orders
      .filter((o) => o.status === "approved")
      .reduce((s, o) => s + (o.finalAmount || 0), 0);
    const byCat = {};
    CATEGORIES.forEach((c) => {
      const si = inventory.filter((i) => i.category === c);
      const ao = orders.filter((o) => o.status === "approved" && (o.adminCategory || o.category) === c);
      byCat[c] = {
        stockCount:    si.length,
        stockValue:    si.reduce((s, i) => s + (i.amount || 0), 0),
        arrivingCount: ao.length,
        arrivingValue: ao.reduce((s, o) => s + (o.finalAmount || 0), 0),
      };
    });
    return { stockValue, arrivingValue, total: stockValue + arrivingValue, byCat };
  }, [inventory, orders]);

  if (loading) return (
    <div className="loading-screen" style={{ height: "300px" }}>
      <div className="loading-spinner" />
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: "100%" }}>
      <div className="page-header">
        <h2 className="page-title">Review Finances</h2>
        <p className="page-subtitle">Financial overview — INR (₹) · Click any cell in the table to edit it</p>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-label">Total In-Stock Value</p>
          <p className="kpi-value">{fmt(totals.stockValue)}</p>
          <p className="kpi-sub">{inventory.length} items in inventory</p>
        </div>
        <div className="kpi-card kpi-card--amber">
          <p className="kpi-label">Yet to Arrive (Approved)</p>
          <p className="kpi-value">{fmt(totals.arrivingValue)}</p>
          <p className="kpi-sub">{orders.filter(o => o.status === "approved").length} approved orders</p>
        </div>
        <div className="kpi-card kpi-card--total">
          <p className="kpi-label">Combined Total</p>
          <p className="kpi-value">{fmt(totals.total)}</p>
          <p className="kpi-sub">Stock + incoming</p>
        </div>
        <div className="kpi-card kpi-card--pending">
          <p className="kpi-label">Pending Review</p>
          <p className="kpi-value">{orders.filter(o => o.status === "pending").length}</p>
          <p className="kpi-sub">orders awaiting action</p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="finance-section">
        <h3 className="section-title">Category Breakdown</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Items in Stock</th><th>Stock Value</th>
              <th>Orders Arriving</th><th>Arriving Value</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const d = totals.byCat[c];
              return (
                <tr key={c}>
                  <td className="td-name">{c}</td>
                  <td>{d.stockCount}</td>
                  <td>{fmt(d.stockValue)}</td>
                  <td>{d.arrivingCount}</td>
                  <td>{fmt(d.arrivingValue)}</td>
                  <td><strong>{fmt(d.stockValue + d.arrivingValue)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tabs + filter */}
      <div className="finance-section">
        <div className="finance-controls">
          <div className="tab-group">
            <button className={`tab ${activeTab === "instock"  ? "tab--active" : ""}`} onClick={() => setActiveTab("instock")}>
              In Stock ({inStock.length})
            </button>
            <button className={`tab ${activeTab === "arriving" ? "tab--active" : ""}`} onClick={() => setActiveTab("arriving")}>
              Yet to Arrive ({yetToArrive.length})
            </button>
          </div>
          <div className="summary-chips" style={{ margin: 0 }}>
            {ALL_CATS.map((c) => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`chip ${catFilter === c ? "chip--active" : ""}`}>{c}</button>
            ))}
          </div>
        </div>

        {/* ── IN STOCK TABLE ── */}
        {activeTab === "instock" && (
          inStock.length === 0
            ? <div className="empty-state" style={{ marginTop: "1rem" }}><p>No in-stock items for this category.</p></div>
            : (
              <div className="results-table-wrapper" style={{ marginTop: "1rem" }}>
                <p className="field-hint" style={{ marginBottom: "0.5rem" }}>
                  💡 Click any <span style={{ color: "var(--accent)" }}>highlighted cell</span> to edit it inline. Changes save automatically on blur or Enter.
                </p>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Item</th><th>Type</th><th>Category</th><th>Project</th>
                      <th>Qty</th><th>Vendor</th><th>Brand</th>
                      <th>Location</th><th>Date</th><th>Amount (₹)</th><th>Status</th>
                      <th style={{ width: "30px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inStock.map((item) => (
                      <tr key={item.id} style={{ opacity: saving[item.id] ? 0.6 : 1 }}>
                        <td className="td-name">{item.name}</td>
                        <td>
                          <EditCell value={item.type} options={ITEM_TYPES}
                            onSave={(v) => saveInventoryField(item.id, "type", v)} />
                        </td>
                        <td>
                          <EditCell value={item.category} options={CATEGORIES}
                            onSave={(v) => saveInventoryField(item.id, "category", v)} />
                        </td>
                        <td>
                          <EditCell value={item.projectName}
                            onSave={(v) => saveInventoryField(item.id, "projectName", v)} />
                        </td>
                        <td>
                          <EditCell value={String(item.quantity || "")} type="number"
                            onSave={(v) => saveInventoryField(item.id, "quantity", parseInt(v) || 1)} />
                        </td>
                        <td>
                          <EditCell value={item.vendor}
                            onSave={(v) => saveInventoryField(item.id, "vendor", v)} />
                        </td>
                        <td>
                          <EditCell value={item.companyBrand}
                            onSave={(v) => saveInventoryField(item.id, "companyBrand", v)} />
                        </td>
                        <td>
                          <EditCell value={item.storageLocation}
                            onSave={(v) => saveInventoryField(item.id, "storageLocation", v)} />
                        </td>
                        <td>{item.dateOfAcquisition}</td>
                        <td>
                          <EditCell value={item.amount ? String(item.amount) : ""} type="number"
                            onSave={(v) => saveInventoryField(item.id, "amount", parseFloat(v) || 0)} />
                        </td>
                        <td>
                          <span className={`badge ${item.status === "faulty" ? "badge--faulty" : "badge--active"}`}>
                            {item.status}
                          </span>
                          {item.faultyCategory && (
                            <span className="badge badge--sm badge--ber">{item.faultyCategory}</span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {saving[item.id] ? "..." : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={9} style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)", paddingRight: "0.75rem" }}>TOTAL</td>
                      <td style={{ fontWeight: 600, color: "var(--accent)" }}>
                        {fmt(inStock.reduce((s, i) => s + (i.amount || 0), 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
        )}

        {/* ── YET TO ARRIVE TABLE ── */}
        {activeTab === "arriving" && (
          yetToArrive.length === 0
            ? <div className="empty-state" style={{ marginTop: "1rem" }}><p>No approved orders yet to arrive for this category.</p></div>
            : (
              <div className="results-table-wrapper" style={{ marginTop: "1rem" }}>
                {yetToArrive.map((order) => (
                  <div key={order.id} style={{ marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                      <strong style={{ fontSize: "0.875rem", color: "var(--text)" }}>{order.vendorSite || "—"}</strong>
                      <span className="badge badge--returnable">{order.projectName || "—"}</span>
                      <span className="badge badge--active">{order.adminCategory || order.category || "—"}</span>
                      {order.invoiceNumber && <span className="invoice-badge">INV# {order.invoiceNumber}</span>}
                      {order.paymentType  && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{order.paymentType}</span>}
                      {order.orderMadeBy  && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>👤 {order.orderMadeBy}</span>}
                    </div>
                    <table className="results-table">
                      <thead>
                        <tr><th>#</th><th>Item</th><th>Type</th><th>Qty</th><th>Est. Amount (₹)</th><th>Arrived</th></tr>
                      </thead>
                      <tbody>
                        {order.items?.map((item, idx) => (
                          <tr key={idx} style={{ opacity: item.arrived ? 0.55 : 1 }}>
                            <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)" }}>{idx + 1}</td>
                            <td className="td-name">{item.name}</td>
                            <td>{item.type || "—"}</td>
                            <td>{item.quantity}</td>
                            <td>{item.estimatedAmount ? fmt(parseFloat(item.estimatedAmount) * (parseInt(item.quantity) || 1)) : "—"}</td>
                            <td>
                              {item.arrived
                                ? <span className="badge badge--active">✓ In Inventory</span>
                                : <span className="badge badge--warning">Pending</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)" }}>ORDER TOTAL</td>
                          <td style={{ fontWeight: 600, color: "var(--accent)" }}>
                            {fmt(order.finalAmount || order.items?.reduce((s, i) => s + (parseFloat(i.estimatedAmount) || 0) * (parseInt(i.quantity) || 1), 0) || 0)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  );
}