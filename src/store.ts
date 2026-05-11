import { create } from "zustand";

type SurfaceKind = "popup" | "window";

export interface PendingInput {
  moduleId: string;
  value: string;
}

export interface PendingAnalysisOpen {
  entryId: string;
}

interface MimirState {
  activeModuleId: string;
  surfaceKind: SurfaceKind;
  // Single-slot handoff for context-menu prefill. The dispatcher writes here
  // when a popup-mode right-click invocation arrives; the target module's
  // component reads the slot in a useEffect, applies the value, and clears it.
  pendingInput: PendingInput | null;
  // Single-slot handoff for "open this analysis history entry". Written by
  // the dispatcher when a background-completion marker is drained; consumed
  // by the Log Analysis component which looks the entry up by id and renders
  // it as the active view.
  pendingAnalysisOpen: PendingAnalysisOpen | null;
  setActiveModuleId: (id: string) => void;
  setSurfaceKind: (kind: SurfaceKind) => void;
  setPendingInput: (next: PendingInput | null) => void;
  setPendingAnalysisOpen: (next: PendingAnalysisOpen | null) => void;
}

export const useMimirStore = create<MimirState>()((set) => ({
  activeModuleId: "",
  surfaceKind: "popup",
  pendingInput: null,
  pendingAnalysisOpen: null,
  setActiveModuleId: (id) => set({ activeModuleId: id }),
  setSurfaceKind: (kind) => set({ surfaceKind: kind }),
  setPendingInput: (next) => set({ pendingInput: next }),
  setPendingAnalysisOpen: (next) => set({ pendingAnalysisOpen: next }),
}));
