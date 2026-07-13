export interface AiProviderConfig {
  id: string; // UUID assigned at creation
  type: "ollama" | "openai" | "anthropic" | "openai-compatible" | "aiyou";
  label: string; // user-chosen display name
  endpoint: string; // URL
  model?: string; // optional, e.g. "llama3", "gpt-4o"
  authMode?: "apikey" | "bearer"; // used by "aiyou" only — chooses X-API-KEY vs Authorization: Bearer
}

export type AbusechMode = "web" | "api";

// Log Analysis report language. Closed set — union literal, not enum (AGENTS.md §3.1).
export type AnalysisLanguage = "en" | "fr";

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
  logAnalysisLanguage?: AnalysisLanguage; // Log Analysis report language; undefined ⇒ "en"
}

// UI → SW message that patches the settings key. The `settings` key is
// single-writer: only the service worker writes it, so cross-context
// read-modify-write races (e.g. popup-open bumping lastPopupOpenedTs while
// a surface saves lastActiveModuleId) can't drop a write. See TD §9.
export interface SettingsUpdateRequest {
  type: "settings.update";
  patch: Partial<Settings>;
}

export const DEFAULT_SETTINGS: Settings = {
  aiProviders: [],
  ctiTtlHours: 72,
  abusechMode: "web",
  redactionDetectors: {},
  redactionStage2Enabled: false,
  contextMenu: {},
};
