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
  contextMenu?: {
    title: string;
    onInvoke: (selection: string) => void;
  };
}
