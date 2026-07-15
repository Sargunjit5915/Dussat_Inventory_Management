// src/firebase/firestoreService.js — v3 fixed (no composite indexes needed)

import {
  collection, addDoc, updateDoc, deleteDoc, doc, writeBatch,
  query, where, getDocs, serverTimestamp,
  orderBy, limit, getDoc
} from "firebase/firestore";
import { db } from "./config";

// ─── CONSTANTS ────────────────────────────────────────────────
export const ITEM_TYPES  = ["Capital", "Consumable / Fab / Test", "Contingency / Travel", "Manpower"];
export const CATEGORIES  = ["Grant", "DGT"];
export const PROJECTS    = ["Patang", "Non-Patang"];
export const PRIORITIES  = [
  { value: "critical", label: "🔴 Critical — Needed immediately" },
  { value: "high",     label: "🟠 High — Needed within the week" },
  { value: "medium",   label: "🟡 Medium — Needed within the month" },
  { value: "low",      label: "🟢 Low — No urgency" },
];
export const PAYMENT_TYPES = ["UPI", "Credit Card", "Debit Card", "Cash", "Bank Transfer"];
export const ORDER_TYPES   = ["Import", "Export", "Domestic", "Internal"];
export const ORDER_MADE_BY = ["Commander Mukesh Saini", "Dushyant Chauhan"];
export const ORDER_CLASSES = [
  "Motor", "ESC", "Flight Controller (FC)", "Receiver/RC", "Battery",
  "Frame", "Propeller", "Camera/Gimbal", "Sensor", "Wiring/Connector",
  "Ground Station", "Other",
];

// ─── ORDER LIFECYCLE STAGES ────────────────────────────────────
// order: pipeline position (rejected is a terminal branch off "submitted",
// not a position on the main line — its order is -1 by convention).
// cls: badge modifier class from styles.css.
export const ORDER_STAGES = [
  { value: "draft",            label: "Draft",            order: 0,  cls: "badge--muted"     },
  { value: "submitted",        label: "Submitted",        order: 1,  cls: "badge--warning"    },
  { value: "rejected",         label: "Rejected",         order: -1, cls: "badge--faulty"     },
  { value: "approved",         label: "Approved",         order: 2,  cls: "badge--active"     },
  { value: "given_to_vendor",  label: "Given to Vendor",  order: 3,  cls: "badge--returnable" },
  { value: "vendor_responded", label: "Vendor Responded", order: 4,  cls: "badge--ber"        },
  { value: "vendor_accepted",  label: "Vendor Accepted",  order: 5,  cls: "badge--returnable" },
  { value: "payment_done",     label: "Payment Done",     order: 6,  cls: "badge--ber"        },
  { value: "order_placed",     label: "Order Placed",     order: 7,  cls: "badge--returnable" },
  { value: "completed",        label: "Completed",        order: 8,  cls: "badge--active"     },
];
export const STAGE_BY_VALUE = Object.fromEntries(ORDER_STAGES.map((s) => [s.value, s]));

// "pending" is the legacy name for "submitted" — old docs keep the literal
// string forever; every place that reads status should normalize first.
export const normalizeStatus = (status) => (status === "pending" ? "submitted" : status);

// Lightweight vendor-grouping key — no separate vendors collection.
export const computeVendorKey = (vendorSite) => (vendorSite || "").trim().toLowerCase();

// ─── INVENTORY (PV-based) ─────────────────────────────────────
//
// Each inventory document = one Purchase Voucher (PV)
// Shape:
// {
//   pvNumber, date, description, descriptionLower,
//   type, category, amount, payee, projectName,
//   storageLocation, vendor,
//   items: [{ name, quantity, notes }],
//   status: "active" | "faulty",
//   faultyCategory, addedBy, createdAt, updatedAt
// }

// Add a full PV as one inventory document
export async function addInventoryItem(itemData, userId) {
  return await addDoc(collection(db, "inventory"), {
    ...itemData,
    status: "active",
    faultyCategory: null,
    addedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Search PVs by description (vendor) OR by any item name inside the PV.
// Fetches full collection and filters client-side so no composite index needed.
export async function searchInventoryByName(searchTerm) {
  const term = searchTerm.toLowerCase().trim();
  const snapshot = await getDocs(collection(db, "inventory"));
  const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all.filter((pv) => {
    // Match against description/vendor
    if ((pv.descriptionLower || "").includes(term)) return true;
    // Match against any item name inside the PV
    if (pv.items?.some((i) => i.name?.toLowerCase().includes(term))) return true;
    // Match against PV number
    if (String(pv.pvNumber || "").toLowerCase().includes(term)) return true;
    return false;
  });
}

export async function markItemFaulty(itemId, faultyCategory, userId) {
  await updateDoc(doc(db, "inventory", itemId), {
    status: "faulty",
    faultyCategory,
    markedFaultyBy: userId,
    updatedAt: serverTimestamp(),
  });
}

// Fetch entire collection client-side
export async function getAllInventory() {
  const snapshot = await getDocs(collection(db, "inventory"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── ORDER REQUESTS (CART-BASED) ──────────────────────────────

// Save or update a DRAFT order
export async function saveDraftOrder(draftData, userId, userEmail, existingId = null) {
  const payload = {
    ...draftData,
    vendorKey: computeVendorKey(draftData.vendorSite),
    requestedBy: userId,
    requestedByEmail: userEmail,
    status: "draft",
    updatedAt: serverTimestamp(),
  };
  if (existingId) {
    await updateDoc(doc(db, "orderRequests", existingId), payload);
    return existingId;
  } else {
    const newPayload = {
      ...payload,
      createdAt: serverTimestamp(),
      adminCategory: null,
      paymentType:   null,
      orderType:     null,
      orderMadeBy:   null,
      finalAmount:   null,
      adminRemarks:  null,
      adminNotes:    null,
      invoiceNumber: null,
    };
    const ref = await addDoc(collection(db, "orderRequests"), newPayload);
    return ref.id;
  }
}

// Change draft status → submitted
export async function submitOrderRequest(orderId) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    status: "submitted",
    updatedAt: serverTimestamp(),
  });
}

// Get drafts for user — single where clause only, sort client-side
export async function getUserDrafts(userId) {
  const q = query(
    collection(db, "orderRequests"),
    where("requestedBy", "==", userId)
  );
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Filter drafts and sort by updatedAt descending client-side
  return all
    .filter((o) => o.status === "draft")
    .sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? 0;
      const tb = b.updatedAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

// Get submitted orders for user — single where clause, filter/sort client-side
export async function getUserOrders(userId) {
  const q = query(
    collection(db, "orderRequests"),
    where("requestedBy", "==", userId)
  );
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all
    .filter((o) => o.status !== "draft")
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

// Delete a draft
export async function deleteDraft(orderId) {
  await deleteDoc(doc(db, "orderRequests", orderId));
}

// Admin: get ALL orders that are not drafts — full collection fetch, filter client-side
export async function getAllOrderRequests() {
  const snap = await getDocs(collection(db, "orderRequests"));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all
    .filter((o) => o.status !== "draft")
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

// Admin: update order after review
export async function reviewOrderRequest(orderId, reviewData) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    ...reviewData,
    updatedAt: serverTimestamp(),
  });
}

// Admin: save invoice number
export async function updateInvoiceNumber(orderId, invoiceNumber) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    invoiceNumber,
    updatedAt: serverTimestamp(),
  });
}

// Admin: batch-send multiple orders (already "approved") to a vendor in one go
export async function giveOrdersToVendor(orderIds, adminUserId) {
  const batch = writeBatch(db);
  orderIds.forEach((id) => {
    batch.update(doc(db, "orderRequests", id), {
      status: "given_to_vendor",
      givenToVendorAt: serverTimestamp(),
      givenToVendorBy: adminUserId,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

// Admin: record what the vendor said is available (and any item edits made in response)
export async function recordVendorResponse(orderId, items) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    items,
    status: "vendor_responded",
    vendorRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Admin: vendor has confirmed the (possibly modified) order
export async function markVendorAccepted(orderId) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    status: "vendor_accepted",
    vendorAcceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Admin: payment has been made to the vendor
export async function markPaymentDone(orderId, paymentDetails, adminUserId) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    ...paymentDetails,
    status: "payment_done",
    paymentDoneAt: serverTimestamp(),
    paymentDoneBy: adminUserId,
    updatedAt: serverTimestamp(),
  });
}

// Admin: order has officially been placed with the vendor
export async function markOrderPlaced(orderId, adminUserId) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    status: "order_placed",
    orderPlacedAt: serverTimestamp(),
    orderPlacedBy: adminUserId,
    updatedAt: serverTimestamp(),
  });
}

// Admin: mark individual item as arrived → all items from one order accumulate
// into a single inventory PV doc. Does NOT auto-complete the order — that's
// now an explicit separate action (see markOrderComplete).
export async function markItemArrived(orderId, itemIndex, item, userId) {
  const newItem = {
    name:            item.name,
    quantity:        parseInt(item.quantity) || 1,
    storageLocation: item.storageLocation || "Pending assignment",
    notes:           item.notes || "",
    type:            item.type || "Capital",
  };

  const orderSnap = await getDoc(doc(db, "orderRequests", orderId));
  if (!orderSnap.exists()) return;
  const order = { id: orderId, ...orderSnap.data() };

  if (order.inventoryDocId) {
    // PV doc already exists — append this item to its items[] array
    const invSnap = await getDoc(doc(db, "inventory", order.inventoryDocId));
    if (invSnap.exists()) {
      const existingItems = invSnap.data().items || [];
      const existingAmount = invSnap.data().amount || 0;
      const addAmount = item.estimatedAmount ? parseFloat(item.estimatedAmount) : 0;
      await updateDoc(doc(db, "inventory", order.inventoryDocId), {
        items:       [...existingItems, newItem],
        amount:      existingAmount + addAmount,
        totalAmount: existingAmount + addAmount,
        updatedAt:   serverTimestamp(),
      });
    }
  } else {
    // First item arriving — create the PV document for this order
    const invRef = await addDoc(collection(db, "inventory"), {
      pvNumber:         order.pvNumber || "—",
      date:             new Date().toISOString().split("T")[0],
      description:      order.vendorSite || "Order",
      descriptionLower: (order.vendorSite || "order").toLowerCase(),
      type:             item.type || "Capital",
      category:         order.adminCategory || order.category || null,
      projectName:      order.projectName   || null,
      amount:           item.estimatedAmount ? parseFloat(item.estimatedAmount) : null,
      gstAmount:        order.gstAmount      || null,
      otherAmount:      null,
      totalAmount:      item.estimatedAmount ? parseFloat(item.estimatedAmount) : null,
      payee:            order.orderMadeBy    || null,
      sourceOrderId:    orderId,
      items:            [newItem],
      status:           "active",
      faultyCategory:   null,
      addedBy:          userId,
      createdAt:        serverTimestamp(),
      updatedAt:        serverTimestamp(),
    });
    await updateDoc(doc(db, "orderRequests", orderId), {
      inventoryDocId: invRef.id,
      updatedAt:      serverTimestamp(),
    });
  }

  // Mark item as arrived in the order doc (status is left untouched)
  const freshSnap = await getDoc(doc(db, "orderRequests", orderId));
  if (!freshSnap.exists()) return;
  const items = [...(freshSnap.data().items || [])];
  items[itemIndex] = { ...items[itemIndex], arrived: true };
  await updateDoc(doc(db, "orderRequests", orderId), {
    items,
    updatedAt: serverTimestamp(),
  });
}

// Admin: explicit final action once every item has arrived
export async function markOrderComplete(orderId) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    status: "completed",
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ─── USERS (admin) ────────────────────────────────────────────

export async function getAllUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function setUserActive(uid, isActive) {
  await updateDoc(doc(db, "users", uid), { isActive, updatedAt: serverTimestamp() });
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role, updatedAt: serverTimestamp() });
}