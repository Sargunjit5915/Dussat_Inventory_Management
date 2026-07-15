# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal inventory/PV (Purchase Voucher) management tool for Dussat, built with React 18 + Vite and Firebase (Auth + Firestore). Two roles — **User** and **Admin** — with separate dashboards, sharing the same route tree under different layouts.

## Commands

```bash
npm run dev       # start Vite dev server (http://localhost:5173)
npm run build     # production build
npm run preview   # preview production build

firebase deploy --only firestore:rules    # deploy security rules after editing firestore.rules
firebase deploy --only firestore:indexes  # deploy indexes after editing firestore.indexes.json
```

There is no test suite, linter, or CI config in this repo.

Environment variables live in `.env.local` (see `.env.example`): Firebase SDK config (`VITE_FIREBASE_*`) plus `VITE_ADMIN_SECRET_KEY`, the shared secret entered at registration to grant the `admin` role.

## Architecture

**Routing (`src/App.jsx`)** — a single `BrowserRouter` with three route groups:
- `/login`, `/register`, `/unauthorized` — public
- `/dashboard/*` — wrapped in `ProtectedRoute` (any authenticated, approved, active user), renders `DashboardLayout`
- `/admin/*` — wrapped in `ProtectedRoute requiredRole="admin"`, renders `AdminLayout`. Notably, the admin panel also mounts the three user pages (`add-inventory`, `search-inventory`, `order-requests`) at `/admin/...` so admins don't have to leave the admin shell.

**Auth & authorization (`src/context/AuthContext.jsx`, `src/components/ProtectedRoute.jsx`)** — `AuthProvider` listens to Firebase `onAuthStateChanged`, then reads the user's `users/{uid}` Firestore doc to populate `role`, `isActive`, and `approvalStatus` into context. `ProtectedRoute` gates on all of these: unauthenticated → redirect to login; `isActive === false` → deactivated screen; `approvalStatus === "pending"` → awaiting-approval screen; wrong `requiredRole` → `/unauthorized`. All authorization logic funnels through this one component — there is no per-page auth check.

**Registration & approval workflow (`src/firebase/authService.js`, `src/admin/UserManagement.jsx`)** — new registrations are `isActive:false, approvalStatus:"pending"` unless the correct `VITE_ADMIN_SECRET_KEY` was entered (which grants `role:"admin"` and immediate approval). An admin must approve pending users in User Management before they can use the app. **`UserManagement.jsx` additionally hardcodes a `RESTRICTED_TO` email allowlist** — even users with `role:"admin"` cannot access the User Management page unless their email is in that list. Update this list directly in the component when onboarding new super-admins.

**Data model is PV-based, not item-based** (this diverged from `SCHEMA.md`, which describes an older per-item schema — treat `firestoreService.js` as the source of truth, not `SCHEMA.md`):
- One `inventory` document = one Purchase Voucher (PV), with a `pvNumber`, `description` (vendor), amount breakdown (`amount` base + `gstAmount` + `otherAmount` = `totalAmount`), `payee`, `projectName`/`category`, and an embedded `items: [{ name, quantity, storageLocation, notes }]` array. There is no separate per-item collection or document — editing/faulting/removing an "item" means reading the parent PV doc, mutating its `items[]` array, and writing the whole array back (see `patchItem` in `SearchInventory.jsx`, `saveItemField` in `ReviewFinances.jsx`).
- `orderRequests` are cart-based: one doc per vendor/site cart with `status: "draft" | "pending" | "approved" | "rejected" | "completed"` and its own embedded `items[]`. Drafts autosave via `saveDraftOrder` (upsert by `existingId`) and only become visible to admins once `submitOrderRequest` flips status to `"pending"`.
- Business rule duplicated in both `AddInventory.jsx` and `OrderRequests.jsx`: selecting `projectName === "Non-Patang"` force-sets `category` to `"DGT"` and disables the category selector.
- All Firestore queries in `firestoreService.js` are intentionally single-`where` (or no-`where`) and filter/sort client-side, specifically to avoid needing composite indexes — see the header comment "v3 fixed (no composite indexes needed)". Keep new queries consistent with this pattern unless you're also updating `firestore.indexes.json` and redeploying.
- Constants (`ITEM_TYPES`, `CATEGORIES`, `PROJECTS`, `PRIORITIES`, `PAYMENT_TYPES`, `ORDER_TYPES`, `ORDER_MADE_BY`) are defined once at the top of `firestoreService.js` and imported everywhere — add new dropdown options there, not inline in page components.

**Order → Inventory pipeline (`admin/OrderStatus.jsx`, `markItemsArrived` in `firestoreService.js`)** — when an admin marks an order item "arrived," `markItemsArrived` both (a) creates a brand-new `inventory` PV-style doc for that single item (`storageLocation: "Pending assignment"` until someone updates it) and (b) flips `arrived: true` on that item inside the original `orderRequests` doc, auto-completing the order when every item has arrived. This is the only path by which `orderRequests` data becomes `inventory` data.

**Inline editing pattern (`admin/ReviewFinances.jsx`)** — the `EditCell` component implements click-to-edit-in-place for table cells (text/number/select), committing on blur or Enter. Reused across PV-level fields (`saveInventoryField`) and nested item fields (`saveItemField`, which round-trips the entire `items[]` array). Follow this pattern for any new inline-editable admin tables rather than introducing modals/forms.

**Security rules (`firestore.rules`)** — `users`: owner or admin can read; owner can create their own doc; owner or admin can update. `inventory`: any authed user can read/create; only the doc's `addedBy` owner or an admin can update; only admins can delete. `orderRequests`: owner or admin can read/update/delete; any authed user can create. `appData` (used for `payeeCleared` amounts in Review Finances): any authed user can read, only admins can write. When adding new Firestore fields or collections, update this file and redeploy — client-side role checks in React are not a substitute for these rules.

**Firebase project**: `dussat-inventory-system` (`.firebaserc`), Firestore region `asia-south2` (`firebase.json`).
