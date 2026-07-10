import React, { createContext, useContext, useState, useCallback } from "react";
import { X, Info, AlertTriangle, CheckCircle, AlertOctagon } from "lucide-react";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 4000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };
    setToasts((prev) => [...prev, toast]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = {
    info: (msg, dur) => addToast(msg, "info", dur),
    success: (msg, dur) => addToast(msg, "success", dur),
    warning: (msg, dur) => addToast(msg, "warning", dur),
    error: (msg, dur) => addToast(msg, "error", dur),
  };

  return (
    <NotificationContext.Provider value={{ notify, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}

const ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertOctagon,
};

const COLORS = {
  info:    { bg: "rgba(0,212,255,0.10)", border: "rgba(0,212,255,0.25)", icon: "#00D4FF" },
  success: { bg: "rgba(46,242,194,0.10)", border: "rgba(46,242,194,0.25)", icon: "#2EF2C2" },
  warning: { bg: "rgba(255,204,102,0.10)", border: "rgba(255,204,102,0.25)", icon: "#FFCC66" },
  error:   { bg: "rgba(255,77,109,0.10)", border: "rgba(255,77,109,0.25)", icon: "#FF4D6D" },
};

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[360px] w-full"
         style={{ pointerEvents: "none" }}>
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function Toast({ toast, onRemove }) {
  const Icon = ICONS[toast.type] || Info;
  const colors = COLORS[toast.type] || COLORS.info;

  return (
    <div
      className="flex items-start gap-2.5 p-3 rounded-lg text-[12px] leading-snug"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        pointerEvents: "auto",
        animation: "toastSlideIn 0.25s ease-out",
      }}
    >
      <Icon size={16} className="shrink-0 mt-0.5" style={{ color: colors.icon }} />
      <div className="flex-1 min-w-0 text-[#EAF2F7]">{toast.message}</div>
      <button onClick={() => onRemove(toast.id)} className="text-[#6F8193] hover:text-[#EAF2F7] shrink-0 p-0.5">
        <X size={14} />
      </button>
    </div>
  );
}
