// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, role, isActive, loading } = useAuth();

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Authenticating...</p>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  if (!isActive) return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="auth-logo" style={{ background: "#e74c3c" }}>!</div>
        <h1>Account Deactivated</h1>
        <p>Your account has been deactivated. Please contact an administrator.</p>
      </div>
    </div>
  );

  if (requiredRole && role !== requiredRole) return <Navigate to="/unauthorized" replace />;

  return children;
}