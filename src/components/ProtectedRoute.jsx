// src/components/ProtectedRoute.jsx

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { logoutUser } from "../firebase/authService";

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, role, isActive, approvalStatus, loading } = useAuth();

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Authenticating...</p>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  // Account deactivated by admin
  if (!isActive) return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="auth-logo" style={{ background: "#e74c3c" }}>!</div>
        <h1>Account Deactivated</h1>
        <p>Your account has been deactivated. Please contact an administrator.</p>
        <button className="btn-secondary" style={{ marginTop: "1.25rem", width: "auto", padding: "0.5rem 1.25rem" }}
          onClick={logoutUser}>Sign out</button>
      </div>
    </div>
  );

  // Pending admin approval (regular users only)
  if (approvalStatus === "pending") return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="auth-logo" style={{ background: "var(--accent)", color: "#0f1117" }}>⏳</div>
        <h1>Awaiting Approval</h1>
        <p style={{ marginTop: "0.5rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
          Your account has been created and is pending approval by an administrator.
          You will have access once your account is approved.
        </p>
        <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {user.email}
        </p>
        <button className="btn-secondary"
          style={{ marginTop: "1.5rem", width: "auto", padding: "0.5rem 1.25rem" }}
          onClick={logoutUser}>
          Sign out
        </button>
      </div>
    </div>
  );

  // Wrong role
  if (requiredRole && role !== requiredRole) return <Navigate to="/unauthorized" replace />;

  return children;
}