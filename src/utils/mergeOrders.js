// src/utils/mergeOrders.js — collapses sibling orderRequests docs from the
// same vendor + same pipeline stage into a single view-object so admins see
// one order per vendor per stage instead of one card per user submission.
// The underlying Firestore docs are never merged — only the display/edit
// surface is. Actions taken on a merged entry fan out to every member id.

import { normalizeStatus, computeVendorKey } from "../firebase/firestoreService";

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function pickUniform(members, field) {
  const vals = [...new Set(members.map((m) => m[field]).filter((v) => v !== undefined && v !== null && v !== ""))];
  if (vals.length === 0) return "";
  if (vals.length === 1) return vals[0];
  return vals.join(" / ");
}

// Flattens each member's items[] into one array, tagging each item with
// which order doc + index it came from so edits can be routed back.
function flattenItems(members) {
  const items = [];
  members.forEach((o) => {
    (o.items || []).forEach((it, idx) => {
      items.push({ ...it, _orderId: o.id, _itemIdx: idx, _requestedByEmail: o.requestedByEmail });
    });
  });
  return items;
}

// Groups orders by vendor + normalized status. Orders in different stages
// never merge — each stage keeps its own actions and can't share a decision.
export function mergeOrdersByVendor(orders) {
  const groups = {};
  orders.forEach((o) => {
    const vendorKey = o.vendorKey || computeVendorKey(o.vendorSite);
    const key = `${vendorKey}::${normalizeStatus(o.status)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });

  return Object.entries(groups).map(([mergeKey, members]) => {
    members = [...members].sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    const primary = members[0];
    const requestedByEmails = [...new Set(members.map((m) => m.requestedByEmail).filter(Boolean))];
    const priority = members
      .map((m) => m.priority)
      .sort((a, b) => (PRIORITY_RANK[a] ?? 9) - (PRIORITY_RANK[b] ?? 9))[0];
    const finalAmountSum = members.reduce((s, m) => s + (parseFloat(m.finalAmount) || 0), 0);

    return {
      mergeKey,
      isMerged: members.length > 1,
      memberIds: members.map((m) => m.id),
      members,
      id: primary.id,
      vendorKey: primary.vendorKey || computeVendorKey(primary.vendorSite),
      vendorSite: primary.vendorSite || "Unknown Vendor",
      status: primary.status,
      priority,
      projectName:   pickUniform(members, "projectName"),
      category:      pickUniform(members, "category"),
      adminCategory: pickUniform(members, "adminCategory"),
      orderLink:     pickUniform(members, "orderLink"),
      paymentType:   pickUniform(members, "paymentType"),
      orderType:     pickUniform(members, "orderType"),
      orderMadeBy:   pickUniform(members, "orderMadeBy"),
      gstAmount:     pickUniform(members, "gstAmount"),
      adminRemarks:  pickUniform(members, "adminRemarks"),
      adminNotes:    pickUniform(members, "adminNotes"),
      notes: members.map((m) => m.notes).filter(Boolean).join(" | "),
      requestedByEmails,
      items: flattenItems(members),
      finalAmount: finalAmountSum || null,
    };
  });
}

// Splits a flat (possibly admin-edited) items array back into per-order-id
// buckets, keyed by the _orderId tag each item carries. Items without a
// recognizable _orderId (newly added within the merged view) fall back to
// `fallbackOrderId` (the primary/first member).
export function splitItemsByOrder(items, memberIds, fallbackOrderId) {
  const buckets = Object.fromEntries(memberIds.map((id) => [id, []]));
  items.forEach((item) => {
    const { _orderId, _itemIdx, _requestedByEmail, ...clean } = item;
    const targetId = memberIds.includes(_orderId) ? _orderId : fallbackOrderId;
    buckets[targetId].push(clean);
  });
  return buckets;
}
