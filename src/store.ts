import { create } from "zustand";

type SurfaceKind = "popup" | "window";

interface MimirState {
  activeModuleId: string;
  surfaceKind: SurfaceKind;
  setActiveModuleId: (id: string) => void;
  setSurfaceKind: (kind: SurfaceKind) => void;
}

export const useMimirStore = create<MimirState>()((set) => ({
  activeModuleId: "",
  surfaceKind: "popup",
  setActiveModuleId: (id) => set({ activeModuleId: id }),
  setSurfaceKind: (kind) => set({ surfaceKind: kind }),
}));
