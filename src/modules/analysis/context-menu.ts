import type { BackgroundContextMenuEntry } from "@/registry/context-menu-types";
import { runAnalysisInBackground } from "@/modules/analysis/background";

const entry: BackgroundContextMenuEntry = {
  moduleId: "log-analysis",
  title: "Analyse log with Mimir",
  contexts: ["selection"],
  invocation: {
    kind: "background",
    run: runAnalysisInBackground,
  },
};

export default entry;
