// src/pages/Register.jsx

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser } from "../firebase/authService";

export default function Register() {
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
    adminKey: "",
  });
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      return setError("Passwords do not match.");
    }
    if (form.password.length < 6) {
      return setError("Password must be at least 6 characters.");
    }

    setLoading(true);
    try {
      const { role } = await registerUser(
        form.email,
        form.password,
        form.displayName,
        form.adminKey
      );
      navigate(role === "admin" ? "/admin" : "/dashboard/add-inventory");
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-logo">DUSSAT INVENTORY</div>
          <h1>Create account</h1>
          <p>Register to get started</p>
        </div>

        <form onSubmit={handleRegister} className="auth-form">
          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="displayName">Full name</label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              value={form.displayName}
              onChange={handleChange}
              placeholder="Jane Smith"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Min. 6 characters"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
          </div>

          {/* Admin key — collapsed by default so regular users don't notice it */}
          <div className="admin-key-section">
            <button
              type="button"
              className="admin-key-toggle"
              onClick={() => setShowAdminKey((v) => !v)}
            >
              {showAdminKey ? "▲ Hide admin key" : "▼ Have an admin registration key?"}
            </button>

            {showAdminKey && (
              <div className="form-group" style={{ marginTop: "0.5rem" }}>
                <label htmlFor="adminKey">Admin Registration Key</label>
                <input
                  id="adminKey"
                  name="adminKey"
                  type="password"
                  value={form.adminKey}
                  onChange={handleChange}
                  placeholder="Enter key..."
                  autoComplete="off"
                />
                <p className="field-hint">
                  Leave blank for a standard user account. An incorrect key will register you as a standard user.
                </p>
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function friendlyError(code) {
  const map = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password is too weak.",
  };
  return map[code] ?? "Registration failed. Please try again.";
}
