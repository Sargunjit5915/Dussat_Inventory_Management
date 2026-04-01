# Inventory Management System — Phase 1 (User Side)

Built with **React + Vite** and **Firebase** (Auth + Firestore).

---

## Project Structure

```
src/
├── firebase/
│   ├── config.js           ← Firebase app init (reads from .env.local)
│   ├── authService.js      ← register, login, logout
│   └── firestoreService.js ← inventory CRUD, order requests
├── context/
│   └── AuthContext.jsx     ← Global auth state + role
├── components/
│   ├── ProtectedRoute.jsx  ← Route guard (auth + role)
│   └── Sidebar.jsx         ← Dashboard navigation
├── pages/
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── DashboardLayout.jsx ← Sidebar + <Outlet>
│   ├── AddInventory.jsx    ← Page A
│   ├── SearchInventory.jsx ← Page B
│   └── OrderRequests.jsx   ← Page C
├── App.jsx                 ← Router + all route definitions
├── main.jsx
└── styles.css
```

---

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Create your Firebase project
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → follow the wizard
3. In your project: **Build → Authentication → Get started**
   - Enable **Email/Password** provider
4. **Build → Firestore Database → Create database**
   - Start in **production mode** (our rules will handle permissions)
   - Choose a region close to you
5. Go to **Project Settings → Your apps → Add app (Web)**
   - Copy the `firebaseConfig` object values

### 3. Configure environment variables
```bash
cp .env.example .env.local
```
Edit `.env.local` and fill in all `VITE_FIREBASE_*` values from step 2.
Also set `VITE_ADMIN_SECRET_KEY` to a strong, secret string.

### 4. Deploy Firestore security rules
```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools
firebase login
firebase init firestore    # select your project, accept defaults
firebase deploy --only firestore:rules
```

### 5. Create the required Firestore index
The name-search query requires a composite index:

**Option A — Firebase Console:**
- Firestore → Indexes → Add index
- Collection: `inventory`
- Fields: `nameLower` (Ascending), `__name__` (Ascending)
- Scope: Collection

**Option B — Click the auto-generated link:**
When you first run a search, the browser console will show a Firebase error with a direct link to create the index. Click it.

### 6. Run the development server
```bash
npm run dev
```

---

## Role System

| Role    | How to get it                                       | Access                        |
|---------|-----------------------------------------------------|-------------------------------|
| `user`  | Default on registration                             | `/dashboard/*` (all 3 pages)  |
| `admin` | Enter `VITE_ADMIN_SECRET_KEY` at registration       | `/admin` (Phase 2)            |

**To register as Admin:**
1. Go to `/register`
2. Click "Have an admin registration key?"
3. Enter the key you set in `.env.local`

**To deactivate the admin key** after your admins are created:
- Remove `VITE_ADMIN_SECRET_KEY` from `.env.local` — no new admins can be registered via key.
- Existing admins are unaffected.

---

## Pages

| Route                           | Page                  | Description                                     |
|---------------------------------|-----------------------|-------------------------------------------------|
| `/login`                        | Login                 | Email + password sign-in                        |
| `/register`                     | Register              | New account + optional admin key                |
| `/dashboard/add-inventory`      | Page A — Add Item     | Form to add new inventory entries               |
| `/dashboard/search-inventory`   | Page B — Search       | Search by name, mark items faulty + category    |
| `/dashboard/order-requests`     | Page C — Orders       | Submit order requests for admin review          |
| `/admin`                        | Admin (Phase 2)       | Placeholder — to be built next                  |

---

## Phase 2 (Admin Side) — What's Ready for You

The following is already wired up and waiting:
- `role: "admin"` in Firestore user documents
- `/admin` route protected by `requiredRole="admin"`
- `orderRequests` collection with `status` and `adminNotes` fields
- Firestore rules already grant admins full read/write on all collections
- `users` collection with `isActive` field for user management
