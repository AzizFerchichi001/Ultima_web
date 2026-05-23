import { Component, ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Unexpected UI error" };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("UI crash captured by AppErrorBoundary:", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "linear-gradient(160deg, #0A0E1A 0%, #0F2030 65%, #132B3D 100%)",
          color: "#E7F7FF",
          fontFamily: "Segoe UI, sans-serif",
        }}
      >
        <div style={{ maxWidth: 720, textAlign: "center" }}>
          <h1 style={{ marginBottom: 12, fontSize: "2rem", fontWeight: 700 }}>An unexpected error happened</h1>
          <p style={{ marginBottom: 8, opacity: 0.9 }}>
            The page crashed after loading. Refresh once, and if it persists check browser console for details.
          </p>
          <p style={{ opacity: 0.7, fontSize: "0.95rem" }}>{this.state.message}</p>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Keep PWA registration best-effort for local dev.
    });
  });
}
