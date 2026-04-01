// src/firebase/firestoreService.js — v3 fixed (no composite indexes needed)

import {
  collection, addDoc, updateDoc, deleteDoc, doc,
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

// ─── INVENTORY ────────────────────────────────────────────────

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

// Single-field range query — only needs the nameLower index (already set up)
export async function searchInventoryByName(searchTerm) {
  const term = searchTerm.toLowerCase().trim();
  const q = query(
    collection(db, "inventory"),
    where("nameLower", ">=", term),
    where("nameLower", "<=", term + "\uf8ff"),
    orderBy("nameLower"),
    limit(50)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function markItemFaulty(itemId, faultyCategory, userId) {
  await updateDoc(doc(db, "inventory", itemId), {
    status: "faulty",
    faultyCategory,
    markedFaultyBy: userId,
    updatedAt: serverTimestamp(),
  });
}

// Fetch entire collection, sort client-side — no composite index needed
export async function getAllInventory() {
  const snapshot = await getDocs(collection(db, "inventory"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── ORDER REQUESTS (CART-BASED) ──────────────────────────────

// Save or update a DRAFT order
export async function saveDraftOrder(draftData, userId, userEmail, existingId = null) {
  const payload = {
    ...draftData,
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

// Change draft status → pending (submit)
export async function submitOrderRequest(orderId) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    status: "pending",
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

// Admin: mark individual item as arrived → auto-creates inventory doc
export async function markItemsArrived(orderId, itemIndex, item, userId) {
  // 1. Add to inventory
  await addInventoryItem({
    name:              item.name,
    nameLower:         item.name.toLowerCase().trim(),
    type:              item.type              || "Capital",
    quantity:          parseInt(item.quantity) || 1,
    amount:            item.estimatedAmount   ? parseFloat(item.estimatedAmount) : null,
    category:          item.category          || null,
    vendor:            item.vendor            || null,
    companyBrand:      null,
    storageLocation:   "Pending assignment",
    dateOfAcquisition: new Date().toISOString().split("T")[0],
    sourceOrderId:     orderId,
  }, userId);

  // 2. Mark item as arrived in the order doc
  const orderSnap = await getDoc(doc(db, "orderRequests", orderId));
  if (!orderSnap.exists()) return;
  const items = [...(orderSnap.data().items || [])];
  items[itemIndex] = { ...items[itemIndex], arrived: true };
  const allArrived = items.every((i) => i.arrived);

  await updateDoc(doc(db, "orderRequests", orderId), {
    items,
    ...(allArrived ? { status: "completed" } : {}),
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