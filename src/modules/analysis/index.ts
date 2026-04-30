import type { MimirModule } from "@/registry/types";
import { AnalysisComponent } from "@/modules/analysis/component";

const analysisModule: MimirModule = {
  id: "log-analysis",
  category: "analysis",
  label: "Log Analysis",
  component: AnalysisComponent,
};

export default analysisModule;
