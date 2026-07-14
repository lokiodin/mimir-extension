import type { MimirModule } from "@/registry/types";
import { AnalysisComponent } from "@/modules/analysis/component";

// Right-click for Log Analysis runs in the SW (background mode) — see
// src/modules/analysis/context-menu.ts. The popup-side declaration here is
// what the Settings UI walks to render the toggle; `onInvoke` is intentionally
// omitted because this module never receives a popup-mode handoff.
const analysisModule: MimirModule = {
  id: "log-analysis",
  category: "analysis",
  label: "Log Analysis",
  component: AnalysisComponent,
  contextMenu: {
    title: "Analyse log with Mimir",
  },
};

export default analysisModule;
