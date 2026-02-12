import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./webApi";
import "./styles.css";

function ensureRoot() {
  let el = document.getElementById("root");
  if (!el) {
    el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
  }
  return el;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: undefined };
  }
  static getDerivedStateFromError(err: any) {
    return { error: err?.message || String(err) };
  }
  componentDidCatch(err: any) {
    console.error("Renderer error:", err);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#f2f2f5", fontFamily: "system-ui" }}>
          <h2>Renderer Error</h2>
          <pre>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(ensureRoot());
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
});
