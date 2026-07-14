import type React from "react";

export type ModuleCategory =
  | "encoding"
  | "cti"
  | "analysis"
  | "utilities"
  | "payloads"
  | "settings";

export interface MimirModule {
  id: string;
  category: ModuleCategory;
  label: string;
  icon?: React.FC;
  component: React.FC;
  // Optional right-click integration on selected page text. The SW maintains
  // a parallel registry of context-menu entries (src/modules/<id>/context-menu.ts)
  // that carries the click handler. The popup-side declaration here is what
  // the Settings UI walks to show toggles. `onInvoke` is omitted for
  // background-mode modules whose action runs in the SW (Log Analysis).
  contextMenu?: {
    title: string;
    onInvoke?: (selection: string) => void;
  };
}
