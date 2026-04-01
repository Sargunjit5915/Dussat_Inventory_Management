// src/firebase/firestoreService.js — Updated with admin functions

import {
  collection, addDoc, updateDoc, doc,
  query, where, getDocs, serverTimestamp,
  orderBy, limit, getDoc
} from "firebase/firestore";
import { db } from "./config";

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

// Fetch all inventory items (for admin finance view)
export async function getAllInventory() {
  const snapshot = await getDocs(collection(db, "inventory"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── ORDER REQUESTS ───────────────────────────────────────────

export async function submitOrderRequest(orderData, userId) {
  return await addDoc(collection(db, "orderRequests"), {
    ...orderData,
    requestedBy: userId,
    status: "pending",
    // Admin-filled fields (null until reviewed)
    adminCategory: null,
    paymentType: null,
    orderType: null,
    finalAmount: null,
    adminRemarks: null,
    adminNotes: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Fetch all order requests (admin)
export async function getAllOrderRequests() {
  const q = query(collection(db, "orderRequests"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Admin: review an order — fill in details + accept or reject
export async function reviewOrderRequest(orderId, reviewData) {
  await updateDoc(doc(db, "orderRequests", orderId), {
    ...reviewData,
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