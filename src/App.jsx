// src/App.jsx — v3

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import DashboardLayout from "./pages/DashboardLayout";
import AddInventory from "./pages/AddInventory";
import SearchInventory from "./pages/SearchInventory";
import OrderRequests from "./pages/OrderRequests";

import AdminLayout from "./admin/AdminLayout";
import ReviewOrders from "./admin/ReviewOrders";
import ReviewFinances from "./admin/ReviewFinances";
import OrderStatus from "./admin/OrderStatus";
import UserManagement from "./admin/UserManagement";

function Unauthorized() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign:"center" }}>
        <div className="auth-logo">403</div>
        <h1>Access Denied</h1>
        <p>You don't have permission to view this page.</p>
        <a href="/login" className="btn-primary" style={{ display:"inline-block", marginTop:"1rem" }}>Back to Login</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login"        element={<Login />} />
          <Route path="/register"     element={<Register />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="add-inventory" replace />} />
            <Route path="add-inventory"    element={<AddInventory />} />
            <Route path="search-inventory" element={<SearchInventory />} />
            <Route path="order-requests"   element={<OrderRequests />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="review-orders" replace />} />
            <Route path="review-orders"   element={<ReviewOrders />} />
            <Route path="order-status"    element={<OrderStatus />} />
            <Route path="review-finances" element={<ReviewFinances />} />
            <Route path="user-management" element={<UserManagement />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}