export interface AiProviderConfig {
  id: string; // UUID assigned at creation
  type: "ollama" | "openai" | "anthropic" | "openai-compatible" | "aiyou";
  label: string; // user-chosen display name
  endpoint: string; // URL
  model?: string; // optional, e.g. "llama3", "gpt-4o"
  authMode?: "apikey" | "bearer"; // used by "aiyou" only — chooses X-API-KEY vs Authorization: Bearer
}

export type AbusechMode = "web" | "api";

export interface Settings {
  aiProviders: AiProviderConfig[];
  defaultAiProviderId?: string; // fallback for all AI-using modules
  ctiTtlHours: number; // cache staleness threshold, default 72
  abusechMode: AbusechMode; // hunting.abuse.ch auth mode (TECHNICAL_DESIGN.md §6)
  redactionDetectors: Record<string, boolean>; // detectorId -> enabled
  redactionStage2Enabled: boolean; // Stage 2 AI enrichment on by default? PRD §7.5: default false.
  redactionAiProviderId?: string; // optional override; falls back to defaultAiProviderId
  contextMenu: Record<string, boolean>; // moduleId -> enabled
  lastPopupOpenedTs?: number; // epoch ms; used by SW to compute the unread-analyses badge
  lastActiveModuleId?: string; // module id to restore on popup/window open; undefined = no preference yet
}

export const DEFAULT_SETTINGS: Settings = {
  aiProviders: [],
  ctiTtlHours: 72,
  abusechMode: "web",
  redactionDetectors: {},
  redactionStage2Enabled: false,
  contextMenu: {},
};
