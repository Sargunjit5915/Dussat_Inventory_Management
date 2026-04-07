# Inventory Management System
### Built with React + Vite and Firebase (Auth + Firestore)

This is an internal inventory management tool built for Dussat. It supports two roles — **User** and **Admin** — each with their own dashboard and set of permissions.

---

## Tech Stack

- **Frontend:** React 18 + Vite
- **Backend/Database:** Firebase (Firestore + Authentication)
- **Routing:** React Router v6
- **Styling:** Custom CSS (no UI library)

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Firebase
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project
2. Enable **Email/Password** under Build → Authentication
3. Create a **Firestore Database** (production mode, region: asia-south1)
4. Register a Web App and copy the config values

### 3. Configure environment variables
```bash
cp .env.example .env.local
```
Fill in your Firebase config values and set a strong `VITE_ADMIN_SECRET_KEY`. This key is used during registration to grant admin access — keep it private.

### 4. Deploy Firestore security rules
```bash
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

### 5. Run the app
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

---

## Role System

| Role | How to get it | Access |
|------|--------------|--------|
| `user` | Default on registration | User dashboard |
| `admin` | Enter admin key at registration | Admin panel |

To register as Admin, click **"Have an admin registration key?"** on the register page and enter the key from your `.env.local`.

Once all admins are set up, you can remove `VITE_ADMIN_SECRET_KEY` from `.env.local` to lock registration permanently.

---

## User Pages

| Route | Page | What it does |
|-------|------|-------------|
| `/dashboard/add-inventory` | Add Inventory | Add new items to inventory with type, category, amount, vendor etc. |
| `/dashboard/search-inventory` | Search & Manage | Search items by name, mark as faulty (Returnable / Fixable / BER), mark fixed, or remove returned items |
| `/dashboard/order-requests` | Order Requests | Submit order lists grouped by vendor — supports drafts, multiple items per order, auto-calculates total |

---

## Admin Pages

| Route | Page | What it does |
|-------|------|-------------|
| `/admin/review-orders` | Review Orders | View all submitted orders, edit item lists, fill in payment/order details, approve or reject |
| `/admin/order-status` | Order Status | Track approved orders, mark individual items as arrived (auto-adds to inventory), add invoice numbers |
| `/admin/review-finances` | Review Finances | Full financial overview — in-stock value, yet-to-arrive, category breakdown. All fields editable inline |
| `/admin/user-management` | User Management | Activate/deactivate users, promote or demote between User and Admin roles |

---

## Project Structure

```
src/
├── admin/              ← Admin-only pages and layout
├── components/         ← ProtectedRoute, Sidebar
├── context/            ← AuthContext (global auth + role state)
├── firebase/           ← config, authService, firestoreService
├── pages/              ← User-facing pages + DashboardLayout
├── App.jsx             ← All route definitions
└── styles.css
```

---

## Key Notes

- **Drafts** — Order requests auto-save as drafts. Users can close and return to them anytime before submitting.
- **Non-Patang projects** automatically get category set to **DGT**.
- **Arrived items** — When an admin marks an order item as arrived in Order Status, it is automatically added to inventory and becomes searchable.
- **Inline editing** — Admins can edit inventory fields (category, vendor, location, amount etc.) directly in the Review Finances table without opening a separate form.
- **Faulty workflow** — Fixable items can be marked as Fixed (restores to active). Returnable items can be removed from inventory entirely.

---

*For any issues or feature requests, raise them directly with the development team.*