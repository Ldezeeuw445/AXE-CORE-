import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "./App.css";
import Login from "./pages/Login";
import Terminal from "./pages/Terminal";
import Spinners from "./pages/Spinners";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AlertsProvider } from "./contexts/AlertsContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { AxeChatWidget } from "./components/axe/AxeChatWidget";

function RequireAuth({ children }) {
  const { token, ready } = useAuth();
  if (!ready) return null;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { token } = useAuth();
  useEffect(() => { document.documentElement.classList.add("dark"); }, []);
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Terminal />
          </RequireAuth>
        }
      />
      <Route
        path="/spinners"
        element={
          <RequireAuth>
            <Spinners />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <AlertsProvider>
          <NotificationProvider>
            <BrowserRouter>
              <AppRoutes />
              <AxeChatGate />
            </BrowserRouter>
          </NotificationProvider>
        </AlertsProvider>
      </AuthProvider>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

function AxeChatGate() {
  const { token } = useAuth();
  if (!token) return null;
  return <AxeChatWidget />;
}

export default App;
