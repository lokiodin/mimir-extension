import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { useMimirStore } from "./store";
import "./index.css";

const queryClient = new QueryClient();

export function mount(
  elementId: string,
  surfaceKind: "popup" | "window",
): void {
  useMimirStore.getState().setSurfaceKind(surfaceKind);

  const container = document.getElementById(elementId);
  if (!container) {
    throw new Error(`Mount target #${elementId} not found`);
  }
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
