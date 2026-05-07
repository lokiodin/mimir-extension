// Endpoint resolution shared by every adapter.

import type { AiProviderConfig } from "@/storage/types";

const DEFAULT_ENDPOINTS: Record<AiProviderConfig["type"], string> = {
  ollama: "http://localhost:11434",
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  "openai-compatible": "",
  aiyou: "",
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function effectiveEndpoint(provider: AiProviderConfig): string {
  const raw = provider.endpoint?.trim() ?? "";
  if (raw) return trimSlash(raw);
  return DEFAULT_ENDPOINTS[provider.type];
}
