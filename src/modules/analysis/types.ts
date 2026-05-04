import type { AiProviderConfig } from "@/storage/types";

export interface AnalysisHistoryEntry {
  id: string;
  timestamp: number;
  input: string;
  response: string;
  providerLabel: string;
  providerType: AiProviderConfig["type"];
  // True when the entry is a failed analysis. `response` then carries the
  // error message and the history pane renders it distinctly.
  error?: boolean;
}
