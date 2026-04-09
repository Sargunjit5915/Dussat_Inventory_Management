// src/admin/ReviewFinances.jsx — v4: GST totals, sub-sort, time period filter

import React, { useState, useEffect, useMemo } from "react";
import { getAllInventory, getAllOrderRequests } from "../firebase/firestoreService";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { CATEGORIES, ITEM_TYPES } from "../firebase/firestoreService";

const ALL_CATS = ["All", ...CATEGORIES];
const fmt  = (n) => `₹${(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today = () => new Date().toISOString().split("T")[0];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; };

const TIME_PRESETS = [
  { label:"Last 7 days",   value:"7"   },
  { label:"Last 30 days",  value:"30"  },
  { label:"Last 3 months", value:"90"  },
  { label:"Custom range",  value:"custom" },
  { label:"All time",      value:"all" },
];

const SORT_OPTIONS = [
  { value:"date_desc",    label:"Date (Newest first)" },
  { value:"date_asc",     label:"Date (Oldest first)" },
  { value:"amount_desc",  label:"Amount (High to Low)" },
  { value:"amount_asc",   label:"Amount (Low to High)" },
  { value:"type",         label:"Type" },
  { value:"project",      label:"Project" },
];

function EditCell({ value, type="text", options=null, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value||"");
  const commit = async () => { setEditing(false); if (draft!==(value||"")) await onSave(draft); };
  if (!editing) return (
    <span className="editable-cell" onClick={()=>{setDraft(value||"");setEditing(true);}} title="Click to edit">
      {value||<span style={{color:"var(--text-muted)",fontStyle:"italic"}}>—</span>}
    </span>
  );
  if (options) return (
    <select className="inline-edit-input" value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={commit} autoFocus>
      <option value="">—</option>
      {options.map((o)=><option key={o} value={o}>{o}</option>)}
    </select>
  );
  return (
    <input className="inline-edit-input" type={type} value={draft}
      onChange={(e)=>setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e)=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEditing(false);}}
      autoFocus />
  );
}

export default function ReviewFinances() {
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [catFilter, setCatFilter] = useState("All");
  const [activeTab, setActiveTab] = useState("instock");
  const [saving, setSaving]       = useState({});
  const [expandedPV, setExpandedPV] = useState(null);

  // Time period filter
  const [timePreset, setTimePreset]   = useState("all");
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState(today());

  // Sub-sort
  const [sortBy, setSortBy] = useState("date_desc");

  useEffect(() => {
    Promise.all([getAllInventory(), getAllOrderRequests()]).then(([inv,ord])=>{
      setInventory(inv); setOrders(ord); setLoading(false);
    });
  }, []);

  const saveInventoryField = async (itemId, field, value) => {
    setSaving((p)=>({...p,[itemId]:true}));
    try {
      const parsed = ["amount","gstAmount","otherAmount","totalAmount"].includes(field) ? parseFloat(value)||0 : value;
      await updateDoc(doc(db,"inventory",itemId),{[field]:parsed});
      setInventory((prev)=>prev.map((i)=>i.id===itemId?{...i,[field]:parsed}:i));
    } catch(err){console.error(err);}
    finally{setSaving((p)=>({...p,[itemId]:false}));}
  };

  // Save a field on an individual item inside a PV's items[] array
  const saveItemField = async (pvId, itemIdx, field, value) => {
    const pvDoc = inventory.find((i)=>i.id===pvId);
    if (!pvDoc) return;
    const items = pvDoc.items.map((it,i)=>i===itemIdx?{...it,[field]:value}:it);
    await updateDoc(doc(db,"inventory",pvId),{items});
    setInventory((prev)=>prev.map((i)=>i.id===pvId?{...i,items}:i));
  };

  // Compute date range from preset
  const dateRange = useMemo(()=>{
    if (timePreset==="all")    return { from:null, to:null };
    if (timePreset==="custom") return { from:customFrom||null, to:customTo||null };
    return { from:daysAgo(parseInt(timePreset)), to:today() };
  },[timePreset,customFrom,customTo]);

  // Filter inventory by category + date
  const inStock = useMemo(()=>{
    let items = inventory.filter((i)=>catFilter==="All"||i.category===catFilter);
    if (dateRange.from) items = items.filter((i)=>(i.date||i.dateOfAcquisition||"")>=dateRange.from);
    if (dateRange.to)   items = items.filter((i)=>(i.date||i.dateOfAcquisition||"")<=dateRange.to);
    // Sort
    return [...items].sort((a,b)=>{
      if (sortBy==="date_desc")   return (b.date||"").localeCompare(a.date||"");
      if (sortBy==="date_asc")    return (a.date||"").localeCompare(b.date||"");
      if (sortBy==="amount_desc") return (b.totalAmount||b.amount||0)-(a.totalAmount||a.amount||0);
      if (sortBy==="amount_asc")  return (a.totalAmount||a.amount||0)-(b.totalAmount||b.amount||0);
      if (sortBy==="type")        return (a.type||"").localeCompare(b.type||"");
      if (sortBy==="project")     return (a.projectName||"").localeCompare(b.projectName||"");
      return 0;
    });
  },[inventory,catFilter,dateRange,sortBy]);

  const yetToArrive = useMemo(()=>
    orders.filter((o)=>(o.status==="approved"||o.status==="completed")&&(catFilter==="All"||(o.adminCategory||o.category)===catFilter)),
    [orders,catFilter]
  );

  // Totals (respect time filter for in-stock)
  const totals = useMemo(()=>{
    const stockBase  = inStock.reduce((s,i)=>s+parseFloat(i.amount||0),0);
    const stockGST   = inStock.reduce((s,i)=>s+parseFloat(i.gstAmount||0),0);
    const stockOther = inStock.reduce((s,i)=>s+parseFloat(i.otherAmount||0),0);
    const stockTotal = inStock.reduce((s,i)=>s+parseFloat(i.amount||0)+parseFloat(i.gstAmount||0)+parseFloat(i.otherAmount||0),0);
    const arrivingTotal = orders.filter(o=>o.status==="approved").reduce((s,o)=>s+(o.finalAmount||0),0);
    const arrivingGST   = orders.filter(o=>o.status==="approved").reduce((s,o)=>s+(o.gstAmount||0),0);
    const byCat = {};
    CATEGORIES.forEach((c)=>{
      const si = inventory.filter((i)=>i.category===c);
      const ao = orders.filter((o)=>o.status==="approved"&&(o.adminCategory||o.category)===c);
      byCat[c]={
        stockCount:    si.length,
        stockValue:    si.reduce((s,i)=>s+parseFloat(i.amount||0),0),
        stockGST:      si.reduce((s,i)=>s+parseFloat(i.gstAmount||0),0),
        stockTotal:    si.reduce((s,i)=>s+parseFloat(i.amount||0)+parseFloat(i.gstAmount||0)+parseFloat(i.otherAmount||0),0),
        arrivingCount: ao.length,
        arrivingValue: ao.reduce((s,o)=>s+(o.finalAmount||0),0),
        arrivingGST:   ao.reduce((s,o)=>s+(o.gstAmount||0),0),
      };
    });
    return { stockBase, stockGST, stockOther, stockTotal, arrivingTotal, arrivingGST, byCat };
  },[inStock,orders,inventory]);

  if (loading) return <div className="loading-screen" style={{height:"300px"}}><div className="loading-spinner"/></div>;

  return (
    <div className="page" style={{maxWidth:"100%"}}>
      <div className="page-header">
        <h2 className="page-title">Review Finances</h2>
        <p className="page-subtitle">Financial overview — INR (₹) · Click any cell to edit inline</p>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-label">Base Amount (In Stock)</p>
          <p className="kpi-value">{fmt(totals.stockBase)}</p>
          <p className="kpi-sub">{inStock.length} PVs{dateRange.from ? " in period" : ""}</p>
        </div>
        <div className="kpi-card kpi-card--amber">
          <p className="kpi-label">GST Amount (In Stock)</p>
          <p className="kpi-value">{fmt(totals.stockGST)}</p>
          <p className="kpi-sub">GST paid to date</p>
        </div>
        <div className="kpi-card kpi-card--total">
          <p className="kpi-label">Total In-Stock Value</p>
          <p className="kpi-value">{fmt(totals.stockTotal)}</p>
          <p className="kpi-sub">Base + GST + Other</p>
        </div>
        <div className="kpi-card kpi-card--pending">
          <p className="kpi-label">Yet to Arrive</p>
          <p className="kpi-value">{fmt(totals.arrivingTotal)}</p>
          <p className="kpi-sub">GST: {fmt(totals.arrivingGST)}</p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="finance-section">
        <h3 className="section-title">Category Breakdown</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>In Stock</th><th>Base Value</th><th>GST</th><th>Total</th>
              <th>Arriving</th><th>Arriving Value</th><th>Arriving GST</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c)=>{
              const d=totals.byCat[c];
              return (
                <tr key={c}>
                  <td className="td-name">{c}</td>
                  <td>{d.stockCount}</td>
                  <td>{fmt(d.stockValue)}</td>
                  <td>{fmt(d.stockGST)}</td>
                  <td><strong>{fmt(d.stockTotal)}</strong></td>
                  <td>{d.arrivingCount}</td>
                  <td>{fmt(d.arrivingValue)}</td>
                  <td>{fmt(d.arrivingGST)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tabs + filters */}
      <div className="finance-section">
        <div className="finance-controls" style={{flexWrap:"wrap",gap:"0.75rem"}}>
          <div className="tab-group">
            <button className={`tab ${activeTab==="instock"  ?"tab--active":""}`} onClick={()=>setActiveTab("instock")}>In Stock ({inStock.length})</button>
            <button className={`tab ${activeTab==="arriving" ?"tab--active":""}`} onClick={()=>setActiveTab("arriving")}>Yet to Arrive ({yetToArrive.length})</button>
          </div>
          <div className="summary-chips" style={{margin:0}}>
            {ALL_CATS.map((c)=>(
              <button key={c} onClick={()=>setCatFilter(c)} className={`chip ${catFilter===c?"chip--active":""}`}>{c}</button>
            ))}
          </div>
        </div>

        {/* Time period + sort controls — only for In Stock */}
        {activeTab==="instock" && (
          <div className="finance-filter-row">
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",flexWrap:"wrap"}}>
              <span className="filter-label">Period:</span>
              {TIME_PRESETS.map((p)=>(
                <button key={p.value} onClick={()=>setTimePreset(p.value)}
                  className={`chip chip--sm ${timePreset===p.value?"chip--active":""}`}>{p.label}</button>
              ))}
              {timePreset==="custom" && (
                <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                  <input type="date" value={customFrom} onChange={(e)=>setCustomFrom(e.target.value)}
                    style={{fontSize:"0.75rem",padding:"0.2rem 0.4rem"}} />
                  <span style={{color:"var(--text-muted)",fontSize:"0.75rem"}}>to</span>
                  <input type="date" value={customTo} onChange={(e)=>setCustomTo(e.target.value)}
                    style={{fontSize:"0.75rem",padding:"0.2rem 0.4rem"}} />
                </div>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
              <span className="filter-label">Sort by:</span>
              <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)}
                style={{fontSize:"0.75rem",padding:"0.25rem 0.5rem",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"var(--radius)",color:"var(--text)"}}>
                {SORT_OPTIONS.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── IN STOCK TABLE ── */}
        {activeTab==="instock" && (
          inStock.length===0
            ? <div className="empty-state" style={{marginTop:"1rem"}}><p>No PVs found for the selected filters.</p></div>
            : (
              <div className="results-table-wrapper" style={{marginTop:"1rem"}}>
                <p className="field-hint" style={{marginBottom:"0.5rem"}}>
                  💡 Click any <span style={{color:"var(--accent)"}}>highlighted cell</span> to edit. Click the PV row to expand items.
                </p>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>PV</th><th>Description / Vendor</th><th>Date</th>
                      <th>Type</th><th>Category</th><th>Project</th><th>Payee</th>
                      <th>Base (₹)</th><th>GST (₹)</th><th>Other (₹)</th><th>Total (₹)</th>
                      <th>Status</th><th style={{width:"30px"}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inStock.map((item)=>(
                      <React.Fragment key={item.id}>
                        <tr style={{opacity:saving[item.id]?0.6:1,cursor:"pointer"}}
                          onClick={()=>setExpandedPV(expandedPV===item.id?null:item.id)}>
                          <td style={{fontFamily:"var(--font-mono)",fontSize:"0.72rem",color:"var(--text-muted)"}}>
                            <span style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                              <span style={{fontSize:"0.6rem",color:"var(--accent)"}}>{expandedPV===item.id?"▼":"▶"}</span>
                              <span onClick={(e)=>e.stopPropagation()}>
                                <EditCell value={item.pvNumber} onSave={(v)=>saveInventoryField(item.id,"pvNumber",v)}/>
                              </span>
                            </span>
                          </td>
                          <td className="td-name">{item.description||item.name||"—"}</td>
                          <td>{item.date||item.dateOfAcquisition||"—"}</td>
                          <td onClick={(e)=>e.stopPropagation()}>
                            <EditCell value={item.type} options={ITEM_TYPES} onSave={(v)=>saveInventoryField(item.id,"type",v)}/>
                          </td>
                          <td onClick={(e)=>e.stopPropagation()}>
                            <EditCell value={item.category} options={CATEGORIES} onSave={(v)=>saveInventoryField(item.id,"category",v)}/>
                          </td>
                          <td onClick={(e)=>e.stopPropagation()}>
                            <EditCell value={item.projectName} onSave={(v)=>saveInventoryField(item.id,"projectName",v)}/>
                          </td>
                          <td onClick={(e)=>e.stopPropagation()}>
                            <EditCell value={item.payee} onSave={(v)=>saveInventoryField(item.id,"payee",v)}/>
                          </td>
                          <td onClick={(e)=>e.stopPropagation()}>
                            <EditCell value={item.amount?String(item.amount):""} type="number"
                              onSave={(v)=>saveInventoryField(item.id,"amount",parseFloat(v)||0)}/>
                          </td>
                          <td onClick={(e)=>e.stopPropagation()}>
                            <EditCell value={item.gstAmount?String(item.gstAmount):""} type="number"
                              onSave={(v)=>saveInventoryField(item.id,"gstAmount",parseFloat(v)||0)}/>
                          </td>
                          <td onClick={(e)=>e.stopPropagation()}>
                            <EditCell value={item.otherAmount?String(item.otherAmount):""} type="number"
                              onSave={(v)=>saveInventoryField(item.id,"otherAmount",parseFloat(v)||0)}/>
                          </td>
                          <td style={{fontWeight:600,color:"var(--accent)",fontFamily:"var(--font-mono)",fontSize:"0.8rem"}}>
                            {fmt(parseFloat(item.amount||0)+parseFloat(item.gstAmount||0)+parseFloat(item.otherAmount||0))}
                          </td>
                          <td>
                            <span className={`badge ${item.status==="faulty"?"badge--faulty":"badge--active"}`}>{item.status}</span>
                            {item.faultyCategory&&<span className="badge badge--sm badge--ber">{item.faultyCategory}</span>}
                          </td>
                          <td style={{fontSize:"0.65rem",color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>
                            {saving[item.id]?"...":""}
                          </td>
                        </tr>
                        {expandedPV===item.id && item.items?.length>0 && (
                          <tr>
                            <td colSpan={13} style={{padding:"0",background:"var(--bg)",borderBottom:"2px solid var(--border)"}}>
                              <div style={{padding:"0.75rem 1.5rem 0.75rem 2.5rem"}}>
                                <p style={{fontFamily:"var(--font-mono)",fontSize:"0.65rem",letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--text-muted)",marginBottom:"0.5rem"}}>
                                  Items in PV {item.pvNumber} ({item.items.length})
                                  {item.otherAmountNotes && <span style={{marginLeft:"1rem",color:"var(--text-dim)"}}>Other: {item.otherAmountNotes}</span>}
                                </p>
                                <table className="results-table" style={{marginBottom:0}}>
                                  <thead>
                                    <tr><th>#</th><th>Item Name</th><th>Qty</th><th>Storage Location</th><th>Notes</th></tr>
                                  </thead>
                                  <tbody>
                                    {item.items.map((it,idx)=>(
                                      <tr key={idx}>
                                        <td style={{fontFamily:"var(--font-mono)",fontSize:"0.68rem",color:"var(--text-muted)"}}>{idx+1}</td>
                                        <td className="td-name">{it.name}</td>
                                        <td>{it.quantity}</td>
                                        <td onClick={(e)=>e.stopPropagation()}><EditCell value={it.storageLocation} onSave={(v)=>saveItemField(item.id,idx,"storageLocation",v)}/></td>
                                        <td style={{color:"var(--text-muted)",fontSize:"0.8rem"}}>{it.notes||"—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7} style={{textAlign:"right",fontFamily:"var(--font-mono)",fontSize:"0.72rem",color:"var(--text-muted)",paddingRight:"0.75rem"}}>TOTAL</td>
                      <td style={{fontWeight:600,color:"var(--text)",fontFamily:"var(--font-mono)"}}>{fmt(inStock.reduce((s,i)=>s+parseFloat(i.amount||0),0))}</td>
                      <td style={{fontWeight:600,color:"var(--text)",fontFamily:"var(--font-mono)"}}>{fmt(inStock.reduce((s,i)=>s+parseFloat(i.gstAmount||0),0))}</td>
                      <td style={{fontWeight:600,color:"var(--text)",fontFamily:"var(--font-mono)"}}>{fmt(inStock.reduce((s,i)=>s+parseFloat(i.otherAmount||0),0))}</td>
                      <td style={{fontWeight:600,color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{fmt(inStock.reduce((s,i)=>s+parseFloat(i.amount||0)+parseFloat(i.gstAmount||0)+parseFloat(i.otherAmount||0),0))}</td>
                      <td colSpan={2}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
        )}

        {/* ── YET TO ARRIVE ── */}
        {activeTab==="arriving" && (
          yetToArrive.length===0
            ? <div className="empty-state" style={{marginTop:"1rem"}}><p>No approved orders to arrive for this category.</p></div>
            : (
              <div className="results-table-wrapper" style={{marginTop:"1rem"}}>
                {yetToArrive.map((order)=>(
                  <div key={order.id} style={{marginBottom:"1.5rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.5rem"}}>
                      <strong style={{fontSize:"0.875rem",color:"var(--text)"}}>{order.vendorSite||"—"}</strong>
                      {order.pvNumber&&<span className="pv-number-badge">PV {order.pvNumber}</span>}
                      <span className="badge badge--returnable">{order.projectName||"—"}</span>
                      <span className="badge badge--active">{order.adminCategory||order.category||"—"}</span>
                      {order.invoiceNumber&&<span className="invoice-badge">INV# {order.invoiceNumber}</span>}
                      {order.paymentType&&<span style={{fontSize:"0.72rem",color:"var(--text-muted)"}}>{order.paymentType}</span>}
                      {order.orderMadeBy&&<span style={{fontSize:"0.72rem",color:"var(--text-muted)"}}>👤 {order.orderMadeBy}</span>}
                    </div>
                    <table className="results-table">
                      <thead>
                        <tr><th>#</th><th>Item</th><th>Type</th><th>Qty</th><th>Est. Amount (₹)</th><th>Arrived</th></tr>
                      </thead>
                      <tbody>
                        {order.items?.map((item,idx)=>(
                          <tr key={idx} style={{opacity:item.arrived?0.55:1}}>
                            <td style={{fontFamily:"var(--font-mono)",fontSize:"0.7rem",color:"var(--text-muted)"}}>{idx+1}</td>
                            <td className="td-name">{item.name}</td>
                            <td>{item.type||"—"}</td>
                            <td>{item.quantity}</td>
                            <td>{item.estimatedAmount?fmt(parseFloat(item.estimatedAmount)*(parseInt(item.quantity)||1)):"—"}</td>
                            <td>{item.arrived?<span className="badge badge--active">✓ In Inventory</span>:<span className="badge badge--warning">Pending</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{textAlign:"right",fontFamily:"var(--font-mono)",fontSize:"0.72rem",color:"var(--text-muted)"}}>ORDER TOTAL</td>
                          <td style={{fontWeight:600,color:"var(--accent)"}}>{fmt(order.finalAmount||order.items?.reduce((s,i)=>s+(parseFloat(i.estimatedAmount)||0)*(parseInt(i.quantity)||1),0)||0)}</td>
                          <td/>
                        </tr>
                        {order.gstAmount>0&&(
                          <tr>
                            <td colSpan={4} style={{textAlign:"right",fontFamily:"var(--font-mono)",fontSize:"0.72rem",color:"var(--text-muted)"}}>GST</td>
                            <td style={{color:"var(--text-dim)",fontFamily:"var(--font-mono)"}}>{fmt(order.gstAmount)}</td>
                            <td/>
                          </tr>
                        )}
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