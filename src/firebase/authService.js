// src/firebase/authService.js
// Centralizes all Firebase Auth + Firestore user operations.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

// ─────────────────────────────────────────────────────────────
// ADMIN SECRET KEY
// Set this string in your .env file as VITE_ADMIN_SECRET_KEY=your_secret
// Anyone who knows this key can register as an Admin.
// ─────────────────────────────────────────────────────────────
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET_KEY ?? "";

/**
 * Register a new user.
 * Creates a Firebase Auth account AND a Firestore user document.
 * If adminKey matches VITE_ADMIN_SECRET_KEY, role is set to "admin".
 *
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @param {string} adminKey  - Optional. Leave blank for regular user registration.
 */
export async function registerUser(email, password, displayName, adminKey = "") {
  const role = ADMIN_SECRET && adminKey === ADMIN_SECRET ? "admin" : "user";

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  await setDoc(doc(db, "users", uid), {
    uid,
    email,
    displayName,
    role,
    createdAt: serverTimestamp(),
    isActive: true,
  });

  return { user: credential.user, role };
}

/**
 * Sign in an existing user.
 */
export async function loginUser(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * Sign out the current user.
 */
export async function logoutUser() {
  await signOut(auth);
}
