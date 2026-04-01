// src/admin/UserManagement.jsx
// Admin Page 3: View, activate/deactivate, and promote/demote users.

import { useState, useEffect } from "react";
import { getAllUsers, setUserActive, setUserRole } from "../firebase/firestoreService";
import { useAuth } from "../context/AuthContext";

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState({});

  useEffect(() => {
    getAllUsers().then((data) => { setUsers(data); setLoading(false); });
  }, []);

  const toggleActive = async (uid, current) => {
    setSaving((p) => ({ ...p, [uid]: true }));
    try {
      await setUserActive(uid, !current);
      setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, isActive: !current } : u));
    } finally {
      setSaving((p) => ({ ...p, [uid]: false }));
    }
  };

  const toggleRole = async (uid, current) => {
    const newRole = current === "admin" ? "user" : "admin";
    if (!window.confirm(`Change this user to "${newRole}"?`)) return;
    setSaving((p) => ({ ...p, [uid + "_role"]: true }));
    try {
      await setUserRole(uid, newRole);
      setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, role: newRole } : u));
    } finally {
      setSaving((p) => ({ ...p, [uid + "_role"]: false }));
    }
  };

  if (loading) return <div className="loading-screen" style={{ height: "200px" }}><div className="loading-spinner" /></div>;

  return (
    <div className="page" style={{ maxWidth: "900px" }}>
      <div className="page-header">
        <h2 className="page-title">User Management</h2>
        <p className="page-subtitle">{users.length} registered user{users.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="results-table-wrapper">
        <table className="results-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Registered</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.uid === currentUser?.uid;
              const regDate = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString("en-IN") : "—";
              return (
                <tr key={u.uid}>
                  <td className="td-name">{u.displayName || "—"}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "badge--ber" : "badge--returnable"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.isActive ? "badge--active" : "badge--faulty"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{regDate}</td>
                  <td>
                    {isSelf ? (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>— you —</span>
                    ) : (
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          className={u.isActive ? "btn-danger-sm" : "btn-outline-sm"}
                          onClick={() => toggleActive(u.uid, u.isActive)}
                          disabled={saving[u.uid]}
                        >
                          {saving[u.uid] ? "..." : u.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="btn-outline-sm"
                          onClick={() => toggleRole(u.uid, u.role)}
                          disabled={saving[u.uid + "_role"]}
                        >
                          {saving[u.uid + "_role"] ? "..." : u.role === "admin" ? "→ User" : "→ Admin"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint" style={{ marginTop: "1rem" }}>
        Note: Deactivating a user blocks their dashboard access on next login check. Changing role takes effect on their next login.
      </p>
    </div>
  );
}
