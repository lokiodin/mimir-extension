import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

export function mount(elementId: string): void {
  const container = document.getElementById(elementId);
  if (!container) {
    throw new Error(`Mount target #${elementId} not found`);
  }
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
