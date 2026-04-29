export interface AiProviderConfig {
  id: string; // UUID assigned at creation
  type: "ollama" | "openai" | "anthropic" | "openai-compatible";
  label: string; // user-chosen display name
  endpoint: string; // URL
  model?: string; // optional, e.g. "llama3", "gpt-4o"
}

export interface Settings {
  aiProviders: AiProviderConfig[];
  defaultAiProviderId?: string; // fallback for all AI-using modules
  ctiTtlHours: number; // cache staleness threshold, default 72
  redactionDetectors: Record<string, boolean>; // detectorId -> enabled
  contextMenu: Record<string, boolean>; // moduleId -> enabled
}

export const DEFAULT_SETTINGS: Settings = {
  aiProviders: [],
  ctiTtlHours: 72,
  redactionDetectors: {},
  contextMenu: {},
};
