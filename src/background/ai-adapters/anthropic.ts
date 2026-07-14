// Anthropic adapter. POST /v1/messages with x-api-key + anthropic-version
// headers. Top-level `system` field (NOT a system message in the array).
// Test connection: GET /v1/models with the same auth headers.

import type {
  AiAdapter,
  AiAdapterCompleteResult,
  AiAdapterError,
  AiAdapterRequest,
  AiAdapterTestRequest,
  AiAdapterTestResult,
} from "./types";
import { effectiveEndpoint } from "./shared/endpoint";
import { readErrorBody, timedFetch } from "./shared/http";
import {
  mapFetchExceptionToKind,
  mapHttpStatusToKind,
  shapeFetchExceptionMessage,
} from "./shared/errors";
import type { AiProviderConfig } from "@/storage/types";

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MAX_TOKENS = 4096;

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

function classifyError(err: unknown): AiAdapterError {
  if (err instanceof Error) {
    const match = err.message.match(/^Anthropic: (\d{3})/);
    if (match) {
      return {
        kind: mapHttpStatusToKind(parseInt(match[1], 10)),
        message: err.message,
      };
    }
    if (err.message.startsWith("Anthropic: ")) {
      return { kind: "request_failed", message: err.message };
    }
    if (err.message === "Unexpected response shape from Anthropic") {
      return { kind: "request_failed", message: err.message };
    }
    if (err.message.startsWith("Model name not set")) {
      return { kind: "request_failed", message: err.message };
    }
    if (err.message.startsWith("API key missing")) {
      return { kind: "auth_failed", message: err.message };
    }
  }
  return {
    kind: mapFetchExceptionToKind(err),
    message: shapeFetchExceptionMessage(err),
  };
}

function preflight(
  provider: AiProviderConfig,
  apiKey: string | undefined,
): { error: AiAdapterError } | null {
  if (!provider.model || provider.model.trim() === "") {
    return {
      error: {
        kind: "request_failed",
        message: `Model name not set for ${provider.label}`,
      },
    };
  }
  if (!apiKey) {
    return {
      error: {
        kind: "auth_failed",
        message: `API key missing for ${provider.label}`,
      },
    };
  }
  return null;
}

async function anthropicCompleteImpl(
  provider: AiProviderConfig,
  apiKey: string,
  system: string,
  userInput: string,
): Promise<string> {
  const url = `${effectiveEndpoint(provider)}/v1/messages`;
  const response = await timedFetch({
    url,
    method: "POST",
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: provider.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userInput }],
    }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Anthropic: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { content?: Array<{ type?: string; text?: string }> }
    | null;
  const block = data?.content?.find((b) => b.type === "text");
  if (!block || typeof block.text !== "string") {
    throw new Error("Unexpected response shape from Anthropic");
  }
  return block.text;
}

async function anthropicTestImpl(
  provider: AiProviderConfig,
  apiKey: string,
): Promise<string> {
  const url = `${effectiveEndpoint(provider)}/v1/models`;
  const response = await timedFetch({
    url,
    method: "GET",
    headers: anthropicHeaders(apiKey),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Anthropic: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { data?: unknown[] }
    | null;
  const models = data?.data;
  const count = Array.isArray(models) ? models.length : 0;
  return `Reached Anthropic. ${count} model${count === 1 ? "" : "s"} available.`;
}

const anthropicAdapter: AiAdapter = {
  id: "anthropic",
  async complete(req: AiAdapterRequest): Promise<AiAdapterCompleteResult> {
    const pf = preflight(req.provider, req.apiKey);
    if (pf) return { ok: false, error: pf.error };
    try {
      const text = await anthropicCompleteImpl(
        req.provider,
        req.apiKey as string,
        req.system,
        req.userInput,
      );
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: classifyError(err) };
    }
  },
  async testConnection(
    req: AiAdapterTestRequest,
  ): Promise<AiAdapterTestResult> {
    if (!req.apiKey) {
      return {
        ok: false,
        error: {
          kind: "auth_failed",
          message: `API key missing for ${req.provider.label}`,
        },
      };
    }
    try {
      const message = await anthropicTestImpl(req.provider, req.apiKey);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: classifyError(err) };
    }
  },
};

export default anthropicAdapter;
