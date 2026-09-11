import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((atual) => atual.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message, type = "info", timeout = 2500) => {
      const id = nextId++;
      setToasts((atual) => [...atual, { id, message: String(message || ""), type }]);
      if (timeout > 0) setTimeout(() => remove(id), timeout);
      return id;
    },
    [remove]
  );

  const value = useMemo(
    () => ({
      notify,
      success: (msg, t) => notify(msg, "success", t ?? 2200),
      error: (msg, t) => notify(msg, "error", t ?? 4000),
      warning: (msg, t) => notify(msg, "warning", t ?? 3500),
      info: (msg, t) => notify(msg, "info", t ?? 2500)
    }),
    [notify]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`inpage-toast inpage-toast-${toast.type}`}
            onClick={() => remove(toast.id)}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  return ctx;
}
