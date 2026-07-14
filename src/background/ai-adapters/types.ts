// AI adapter contract. See TECHNICAL_DESIGN.md §7.
//
// Every provider in src/background/ai-adapters/<provider>.ts implements
// AiAdapter. ai-client.ts is a thin dispatcher that resolves the active
// provider, the API key, and the system prompt, then calls the adapter.

import type { AiProviderConfig } from "@/storage/types";

export type AiAdapterErrorKind =
  | "auth_failed" // 401, 403, "API key missing"
  | "rate_limited" // 429
  | "request_failed" // other non-2xx, schema mismatch, "model not set"
  | "network_error" // TypeError from fetch, AbortError (timeout)
  | "empty_response"; // 2xx but no usable text

export interface AiAdapterError {
  kind: AiAdapterErrorKind;
  message: string;
}

export interface AiAdapterRequest {
  provider: AiProviderConfig;
  apiKey?: string; // resolved plaintext; undefined when none configured
  system: string; // resolved system prompt; "" if empty
  userInput: string;
}

export interface AiAdapterTestRequest {
  provider: AiProviderConfig;
  apiKey?: string;
}

export type AiAdapterCompleteResult =
  | { ok: true; text: string }
  | { ok: false; error: AiAdapterError };

export type AiAdapterTestResult =
  | { ok: true; message: string }
  | { ok: false; error: AiAdapterError };

export interface AiAdapter {
  readonly id: AiProviderConfig["type"];
  complete(req: AiAdapterRequest): Promise<AiAdapterCompleteResult>;
  testConnection(req: AiAdapterTestRequest): Promise<AiAdapterTestResult>;
}
