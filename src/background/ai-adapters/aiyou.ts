// AI You adapter. See TECHNICAL_DESIGN.md §7.
//
// Differs from the other adapters in three ways:
//   1. Two auth modes (X-API-KEY with a "DGY_API:" prefix, or Authorization: Bearer JWT).
//      The user picks one in settings; we send only the chosen header.
//   2. Mandatory SSE streaming on every request — the gateway has no non-streaming
//      mode. We buffer the stream internally and return a plain string, so the
//      AiAdapter contract stays non-streaming for the rest of Mimir.
//   3. Server-side tools auto-execution: every request carries `tools: [163]`
//      (the date tool) and `executeToolsDirectly: true`. Tool-execution
//      progress events that arrive on the stream are filtered out — only
//      content deltas are buffered.
//
// Endpoint URL is user-supplied (no shipped default), same shape as
// `openai-compatible`. The withKeepalive boundary covers the entire stream
// consumption — not just the response-headers phase.

import { withKeepalive } from "@/background/keepalive";
import type {
  AiAdapter,
  AiAdapterCompleteResult,
  AiAdapterError,
  AiAdapterErrorKind,
  AiAdapterRequest,
  AiAdapterTestRequest,
  AiAdapterTestResult,
} from "./types";
import { effectiveEndpoint } from "./shared/endpoint";
import { readErrorBody, REQUEST_TIMEOUT_MS } from "./shared/http";
import {
  mapFetchExceptionToKind,
  mapHttpStatusToKind,
  shapeFetchExceptionMessage,
} from "./shared/errors";
import type { AiProviderConfig } from "@/storage/types";

export const AIYOU_MODELS = [
  "aiyou-large-snc",
  "aiyou-medium-snc",
  "aiyou-small-snc",
] as const;
export type AiyouModel = (typeof AIYOU_MODELS)[number];

const AIYOU_DATE_TOOL_ID = 163;

function isAiyouModel(value: string | undefined): value is AiyouModel {
  return (
    typeof value === "string" &&
    (AIYOU_MODELS as readonly string[]).includes(value)
  );
}

function buildHeaders(
  provider: AiProviderConfig,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Default to API Key mode for backwards-compatibility with any provider
  // record that pre-dates the authMode field.
  if (provider.authMode === "bearer") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["X-API-KEY"] = apiKey;
  }
  return headers;
}

interface AiyouTextPart {
  type: "text";
  text: string;
}
interface AiyouMessage {
  role: "user" | "assistant";
  content: AiyouTextPart[];
}

interface AiyouRequestBody {
  model: AiyouModel;
  messages: AiyouMessage[];
  promptSystem?: string;
  stream: true;
  tools: [typeof AIYOU_DATE_TOOL_ID];
  executeToolsDirectly: true;
}

function buildBody(
  model: AiyouModel,
  system: string,
  userInput: string,
): AiyouRequestBody {
  const body: AiyouRequestBody = {
    model,
    messages: [{ role: "user", content: [{ type: "text", text: userInput }] }],
    stream: true,
    tools: [AIYOU_DATE_TOOL_ID],
    executeToolsDirectly: true,
  };
  if (system && system.trim() !== "") {
    body.promptSystem = system;
  }
  return body;
}

function pickContentDelta(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0] as { delta?: { content?: unknown } } | undefined;
  const content = first?.delta?.content;
  return typeof content === "string" ? content : undefined;
}

function isToolExecutionEvent(parsed: unknown): boolean {
  return (
    !!parsed &&
    typeof parsed === "object" &&
    (parsed as { type?: unknown }).type === "tool_execution"
  );
}

async function consumeSseStream(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error("AI You: response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let assembled = "";
  let sawDone = false;

  while (!sawDone) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const eventBlock = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of eventBlock.split("\n")) {
        // Tolerate optional whitespace per the SSE spec.
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "") continue;
        if (payload === "[DONE]") {
          sawDone = true;
          break;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        if (isToolExecutionEvent(parsed)) continue;
        const delta = pickContentDelta(parsed);
        if (typeof delta === "string") {
          assembled += delta;
        }
      }
      if (sawDone) break;
      sep = buffer.indexOf("\n\n");
    }
    if (done) break;
  }

  if (assembled.length === 0) {
    throw new Error("AI You: empty response");
  }
  return assembled;
}

async function aiyouFetch(
  provider: AiProviderConfig,
  apiKey: string,
  body: AiyouRequestBody,
): Promise<string> {
  const url = `${effectiveEndpoint(provider)}/chat/completions`;
  return withKeepalive(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(provider, apiKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errBody = await readErrorBody(response);
        throw new Error(`AI You: ${response.status} ${errBody}`.trim());
      }
      return await consumeSseStream(response);
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

interface ValidatedAiyou {
  model: AiyouModel;
  apiKey: string;
}

function validateAiyou(
  provider: AiProviderConfig,
  apiKey: string | undefined,
): ValidatedAiyou | { error: AiAdapterError } {
  if (!apiKey) {
    return {
      error: {
        kind: "auth_failed",
        message: `API key missing for ${provider.label}`,
      },
    };
  }
  if (!isAiyouModel(provider.model)) {
    return {
      error: {
        kind: "request_failed",
        message: `Unknown AI You model "${provider.model ?? ""}" for ${provider.label}`,
      },
    };
  }
  if (!provider.endpoint || provider.endpoint.trim() === "") {
    return {
      error: {
        kind: "request_failed",
        message: `Endpoint URL required for ${provider.label}`,
      },
    };
  }
  return { model: provider.model, apiKey };
}

function classifyAiyouError(err: unknown): AiAdapterError {
  if (err instanceof Error && err.message.startsWith("AI You: ")) {
    if (err.message === "AI You: empty response") {
      return { kind: "empty_response", message: err.message };
    }
    if (err.message === "AI You: response has no body") {
      return { kind: "request_failed", message: err.message };
    }
    const match = err.message.match(/^AI You: (\d{3})/);
    if (match) {
      const status = parseInt(match[1], 10);
      const kind: AiAdapterErrorKind = mapHttpStatusToKind(status);
      return { kind, message: err.message };
    }
    return { kind: "request_failed", message: err.message };
  }
  return {
    kind: mapFetchExceptionToKind(err),
    message: shapeFetchExceptionMessage(err),
  };
}

const aiyouAdapter: AiAdapter = {
  id: "aiyou",
  async complete(req: AiAdapterRequest): Promise<AiAdapterCompleteResult> {
    const v = validateAiyou(req.provider, req.apiKey);
    if ("error" in v) return { ok: false, error: v.error };
    try {
      const text = await aiyouFetch(
        req.provider,
        v.apiKey,
        buildBody(v.model, req.system, req.userInput),
      );
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: classifyAiyouError(err) };
    }
  },
  async testConnection(
    req: AiAdapterTestRequest,
  ): Promise<AiAdapterTestResult> {
    const v = validateAiyou(req.provider, req.apiKey);
    if ("error" in v) return { ok: false, error: v.error };
    try {
      await aiyouFetch(req.provider, v.apiKey, buildBody(v.model, "", "ping"));
      return {
        ok: true,
        message: `Reached AI You. Model ${v.model} responded.`,
      };
    } catch (err) {
      return { ok: false, error: classifyAiyouError(err) };
    }
  },
};

export default aiyouAdapter;
