// src/admin/UserManagement.jsx — v3: with approval workflow

import { useState, useEffect } from "react";
import { getAllUsers, setUserActive, setUserRole } from "../firebase/firestoreService";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const APPROVAL_LABELS = {
  approved: { label: "Approved", cls: "badge--active"    },
  pending:  { label: "Pending",  cls: "badge--warning"   },
  rejected: { label: "Rejected", cls: "badge--faulty"    },
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState({});
  const [filter, setFilter]   = useState("all"); // "all" | "pending" | "approved"

  useEffect(() => {
    getAllUsers().then((data) => {
      // Show pending users first
      data.sort((a, b) => {
        if (a.approvalStatus === "pending" && b.approvalStatus !== "pending") return -1;
        if (b.approvalStatus === "pending" && a.approvalStatus !== "pending") return 1;
        return 0;
      });
      setUsers(data);
      setLoading(false);
    });
  }, []);

  const approveUser = async (uid) => {
    setSaving((p) => ({ ...p, [`apr_${uid}`]: true }));
    try {
      await updateDoc(doc(db, "users", uid), {
        approvalStatus: "approved",
        isActive: true,
      });
      setUsers((prev) => prev.map((u) =>
        u.uid === uid ? { ...u, approvalStatus: "approved", isActive: true } : u
      ));
    } finally {
      setSaving((p) => ({ ...p, [`apr_${uid}`]: false }));
    }
  };

  const rejectUser = async (uid) => {
    if (!window.confirm("Reject this user? They will not be able to access the app.")) return;
    setSaving((p) => ({ ...p, [`rej_${uid}`]: true }));
    try {
      await updateDoc(doc(db, "users", uid), {
        approvalStatus: "rejected",
        isActive: false,
      });
      setUsers((prev) => prev.map((u) =>
        u.uid === uid ? { ...u, approvalStatus: "rejected", isActive: false } : u
      ));
    } finally {
      setSaving((p) => ({ ...p, [`rej_${uid}`]: false }));
    }
  };

  const toggleActive = async (uid, current) => {
    setSaving((p) => ({ ...p, [uid]: true }));
    try {
      await setUserActive(uid, !current);
      setUsers((prev) => prev.map((u) =>
        u.uid === uid ? { ...u, isActive: !current } : u
      ));
    } finally {
      setSaving((p) => ({ ...p, [uid]: false }));
    }
  };

  const toggleRole = async (uid, current) => {
    const newRole = current === "admin" ? "user" : "admin";
    if (!window.confirm(`Change this user to "${newRole}"?`)) return;
    setSaving((p) => ({ ...p, [`role_${uid}`]: true }));
    try {
      await setUserRole(uid, newRole);
      setUsers((prev) => prev.map((u) =>
        u.uid === uid ? { ...u, role: newRole } : u
      ));
    } finally {
      setSaving((p) => ({ ...p, [`role_${uid}`]: false }));
    }
  };

  const pendingCount = users.filter((u) => u.approvalStatus === "pending").length;

  const filtered = users.filter((u) => {
    if (filter === "pending")  return u.approvalStatus === "pending";
    if (filter === "approved") return u.approvalStatus === "approved";
    return true;
  });

  if (loading) return (
    <div className="loading-screen" style={{ height: "200px" }}>
      <div className="loading-spinner" />
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: "960px" }}>
      <div className="page-header">
        <h2 className="page-title">User Management</h2>
        <p className="page-subtitle">{users.length} registered user{users.length !== 1 ? "s" : ""}
          {pendingCount > 0 && (
            <span style={{ marginLeft: "0.75rem", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
              ● {pendingCount} pending approval
            </span>
          )}
        </p>
      </div>

      {/* Filter chips */}
      <div className="summary-chips">
        {[["all", "All"], ["pending", "Pending Approval"], ["approved", "Approved"]].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`chip ${filter === val ? "chip--active" : ""}`}>
            {label}
            <span className="chip-count">
              {val === "all" ? users.length
               : val === "pending" ? users.filter(u => u.approvalStatus === "pending").length
               : users.filter(u => u.approvalStatus === "approved").length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><p>No users in this category.</p></div>
      ) : (
        <div className="results-table-wrapper">
          <table className="results-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th>
                <th>Approval</th><th>Active</th><th>Registered</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isSelf   = u.uid === currentUser?.uid;
                const isPending = u.approvalStatus === "pending";
                const regDate  = u.createdAt?.toDate
                  ? u.createdAt.toDate().toLocaleDateString("en-IN") : "—";

                return (
                  <tr key={u.uid} style={{ background: isPending ? "rgba(245,166,35,0.04)" : "" }}>
                    <td className="td-name">{u.displayName || "—"}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === "admin" ? "badge--ber" : "badge--returnable"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${APPROVAL_LABELS[u.approvalStatus ?? "approved"]?.cls}`}>
                        {APPROVAL_LABELS[u.approvalStatus ?? "approved"]?.label}
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
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>

                          {/* Pending approval actions */}
                          {isPending && (
                            <>
                              <button className="btn-outline-sm"
                                style={{ color: "var(--success)", borderColor: "rgba(46,204,113,0.4)" }}
                                onClick={() => approveUser(u.uid)}
                                disabled={saving[`apr_${u.uid}`]}>
                                {saving[`apr_${u.uid}`] ? "..." : "✓ Approve"}
                              </button>
                              <button className="btn-danger-sm"
                                onClick={() => rejectUser(u.uid)}
                                disabled={saving[`rej_${u.uid}`]}>
                                {saving[`rej_${u.uid}`] ? "..." : "✗ Reject"}
                              </button>
                            </>
                          )}

                          {/* Approved user actions */}
                          {!isPending && (
                            <>
                              <button
                                className={u.isActive ? "btn-danger-sm" : "btn-outline-sm"}
                                onClick={() => toggleActive(u.uid, u.isActive)}
                                disabled={saving[u.uid]}>
                                {saving[u.uid] ? "..." : u.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button className="btn-outline-sm"
                                onClick={() => toggleRole(u.uid, u.role)}
                                disabled={saving[`role_${u.uid}`]}>
                                {saving[`role_${u.uid}`] ? "..." : u.role === "admin" ? "→ User" : "→ Admin"}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="field-hint" style={{ marginTop: "1rem" }}>
        Approving a user grants them immediate access to the user dashboard. Rejecting blocks access permanently (can be re-approved later).
      </p>
    </div>
  );
}