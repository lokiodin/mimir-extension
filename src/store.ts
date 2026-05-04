import { create } from "zustand";

type SurfaceKind = "popup" | "window";

export interface PendingInput {
  moduleId: string;
  value: string;
}

interface MimirState {
  activeModuleId: string;
  surfaceKind: SurfaceKind;
  // Single-slot handoff for context-menu prefill. The dispatcher writes here
  // when a popup-mode right-click invocation arrives; the target module's
  // component reads the slot in a useEffect, applies the value, and clears it.
  pendingInput: PendingInput | null;
  setActiveModuleId: (id: string) => void;
  setSurfaceKind: (kind: SurfaceKind) => void;
  setPendingInput: (next: PendingInput | null) => void;
}

export const useMimirStore = create<MimirState>()((set) => ({
  activeModuleId: "",
  surfaceKind: "popup",
  pendingInput: null,
  setActiveModuleId: (id) => set({ activeModuleId: id }),
  setSurfaceKind: (kind) => set({ surfaceKind: kind }),
  setPendingInput: (next) => set({ pendingInput: next }),
}));
