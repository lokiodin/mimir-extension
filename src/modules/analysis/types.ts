import type { AiProviderConfig } from "@/storage/types";

export interface AnalysisHistoryEntry {
  id: string;
  timestamp: number;
  input: string;
  response: string;
  providerLabel: string;
  providerType: AiProviderConfig["type"];
}
