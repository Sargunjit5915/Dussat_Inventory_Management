// src/firebase/authService.js

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET_KEY ?? "";

/**
 * Register a new user.
 * Admins: immediately active + approved.
 * Regular users: isActive=false, approvalStatus="pending" until admin approves.
 */
export async function registerUser(email, password, displayName, adminKey = "") {
  const role    = ADMIN_SECRET && adminKey === ADMIN_SECRET ? "admin" : "user";
  const isAdmin = role === "admin";

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  await setDoc(doc(db, "users", uid), {
    uid,
    email,
    displayName,
    role,
    isActive:       isAdmin,          // admins active immediately, users wait
    approvalStatus: isAdmin ? "approved" : "pending",
    createdAt:      serverTimestamp(),
  });

  return { user: credential.user, role };
}

export async function loginUser(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutUser() {
  await signOut(auth);
}