// src/admin/ReviewFinances.jsx
// Admin Page 2: Full financial overview — In Stock + Yet to Arrive, filterable by category.

import { useState, useEffect, useMemo } from "react";
import { getAllInventory, getAllOrderRequests } from "../firebase/firestoreService";

const CATEGORIES = ["All", "Grant", "DGT", "Consumable / Fab / Test", "General"];
const fmt = (n) => `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReviewFinances() {
  const [inventory, setInventory]   = useState([]);
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [catFilter, setCatFilter]   = useState("All");
  const [activeTab, setActiveTab]   = useState("overview"); // overview | instock | arriving

  useEffect(() => {
    Promise.all([getAllInventory(), getAllOrderRequests()]).then(([inv, ord]) => {
      setInventory(inv);
      setOrders(ord);
      setLoading(false);
    });
  }, []);

  // In-stock items (from inventory collection)
  const inStock = useMemo(() => {
    return inventory.filter((i) => catFilter === "All" || i.category === catFilter);
  }, [inventory, catFilter]);

  // Yet-to-arrive items (approved order requests)
  const yetToArrive = useMemo(() => {
    return orders.filter((o) => o.status === "approved" && (catFilter === "All" || (o.adminCategory || o.category) === catFilter));
  }, [orders, catFilter]);

  // Summary totals
  const totals = useMemo(() => {
    const stockValue   = inStock.reduce((s, i) => s + (i.amount || 0), 0);
    const arrivingValue = yetToArrive.reduce((s, o) => s + (o.finalAmount || o.estimatedAmount || 0), 0);
    // Break down by category for overview
    const byCat = {};
    CATEGORIES.slice(1).forEach((c) => {
      const stockItems    = inventory.filter((i) => i.category === c);
      const arrivingItems = orders.filter((o) => o.status === "approved" && (o.adminCategory || o.category) === c);
      byCat[c] = {
        stockCount:    stockItems.length,
        stockValue:    stockItems.reduce((s, i) => s + (i.amount || 0), 0),
        arrivingCount: arrivingItems.length,
        arrivingValue: arrivingItems.reduce((s, o) => s + (o.finalAmount || o.estimatedAmount || 0), 0),
      };
    });
    return { stockValue, arrivingValue, total: stockValue + arrivingValue, byCat };
  }, [inStock, yetToArrive, inventory, orders]);

  if (loading) return <div className="loading-screen" style={{ height: "300px" }}><div className="loading-spinner" /></div>;

  return (
    <div className="page" style={{ maxWidth: "100%" }}>
      <div className="page-header">
        <h2 className="page-title">Review Finances</h2>
        <p className="page-subtitle">Financial overview of inventory and pending orders — INR (₹)</p>
      </div>

      {/* Top KPI cards */}
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

      {/* Category breakdown overview */}
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
            {CATEGORIES.slice(1).map((c) => {
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

      {/* Filter + tabs */}
      <div className="finance-section">
        <div className="finance-controls">
          <div className="tab-group">
            <button className={`tab ${activeTab === "instock" ? "tab--active" : ""}`} onClick={() => setActiveTab("instock")}>In Stock ({inStock.length})</button>
            <button className={`tab ${activeTab === "arriving" ? "tab--active" : ""}`} onClick={() => setActiveTab("arriving")}>Yet to Arrive ({yetToArrive.length})</button>
          </div>
          <div className="summary-chips" style={{ margin: 0 }}>
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCatFilter(c)} className={`chip ${catFilter === c ? "chip--active" : ""}`}>{c}</button>
            ))}
          </div>
        </div>

        {/* In Stock table */}
        {activeTab === "instock" && (
          inStock.length === 0 ? <div className="empty-state"><p>No in-stock items for this category.</p></div> : (
            <div className="results-table-wrapper" style={{ marginTop: "1rem" }}>
              <table className="results-table">
                <thead>
                  <tr><th>Item</th><th>Type</th><th>Category</th><th>Qty</th><th>Vendor</th><th>Brand</th><th>Location</th><th>Date</th><th>Amount (₹)</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {inStock.map((i) => (
                    <tr key={i.id}>
                      <td className="td-name">{i.name}</td>
                      <td>{i.type}</td>
                      <td>{i.category || "—"}</td>
                      <td>{i.quantity}</td>
                      <td>{i.vendor || "—"}</td>
                      <td>{i.companyBrand || "—"}</td>
                      <td>{i.storageLocation}</td>
                      <td>{i.dateOfAcquisition}</td>
                      <td>{i.amount ? fmt(i.amount) : "—"}</td>
                      <td>
                        <span className={`badge ${i.status === "faulty" ? "badge--faulty" : "badge--active"}`}>{i.status}</span>
                        {i.faultyCategory && <span className={`badge badge--sm badge--ber`}>{i.faultyCategory}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)", paddingRight: "0.75rem" }}>TOTAL</td>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>{fmt(inStock.reduce((s, i) => s + (i.amount || 0), 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {/* Yet to Arrive table */}
        {activeTab === "arriving" && (
          yetToArrive.length === 0 ? <div className="empty-state" style={{ marginTop: "1rem" }}><p>No approved orders yet to arrive for this category.</p></div> : (
            <div className="results-table-wrapper" style={{ marginTop: "1rem" }}>
              <table className="results-table">
                <thead>
                  <tr><th>Item</th><th>Qty</th><th>Category</th><th>Payment</th><th>Order Type</th><th>Vendor</th><th>Project</th><th>Remarks</th><th>Final Amount (₹)</th></tr>
                </thead>
                <tbody>
                  {yetToArrive.map((o) => (
                    <tr key={o.id}>
                      <td className="td-name">{o.itemName}</td>
                      <td>{o.quantity}</td>
                      <td>{o.adminCategory || o.category || "—"}</td>
                      <td>{o.paymentType || "—"}</td>
                      <td>{o.orderType || "—"}</td>
                      <td>{o.suggestedVendor || "—"}</td>
                      <td>{o.projectName || "—"}</td>
                      <td>{o.adminRemarks || "—"}</td>
                      <td>{o.finalAmount ? fmt(o.finalAmount) : o.estimatedAmount ? fmt(o.estimatedAmount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted)", paddingRight: "0.75rem" }}>TOTAL</td>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>{fmt(yetToArrive.reduce((s, o) => s + (o.finalAmount || o.estimatedAmount || 0), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
