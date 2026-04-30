// Shared AI client types. See TECHNICAL_DESIGN.md §7.

import type { AiProviderConfig } from "@/storage/types";

export interface AiCompleteRequest {
  type: "ai.complete";
  providerId: string;
  featureId: string;
  userInput: string;
}

export interface AiCompleteSuccess {
  ok: true;
  response: string;
  providerLabel: string;
  providerType: AiProviderConfig["type"];
}

export type AiCompleteResponse =
  | AiCompleteSuccess
  | { ok: false; error: string };

export interface AiTestConnectionRequest {
  type: "ai.test-connection";
  providerId: string;
}

export type AiTestConnectionResponse =
  | { ok: true; message: string }
  | { ok: false; error: string };
