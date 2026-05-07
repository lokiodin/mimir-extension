// AI You adapter. See TECHNICAL_DESIGN.md §7.
//
// Differs from the other adapters in three ways:
//   1. Two auth modes (X-API-KEY with a "DGY_API:" prefix, or Authorization: Bearer JWT).
//      The user picks one in settings; we send only the chosen header.
//   2. Mandatory SSE streaming on every request — the gateway has no non-streaming
//      mode. We buffer the stream internally and return a plain string, so the
//      AiClient interface stays non-streaming for the rest of Mimir.
//   3. Server-side tools auto-execution: every request carries `tools: [163]`
//      (the date tool) and `executeToolsDirectly: true`. The server runs the
//      tool transparently when the model decides to use it; tool-execution
//      progress events that arrive on the stream are filtered out — only
//      content deltas are buffered.
//
// Endpoint URL is user-supplied (no shipped default), same shape as
// `openai-compatible`. The full keepalive boundary covers the entire stream
// consumption — not just the response-headers phase.

import { withKeepalive } from "@/background/keepalive";
import {
  REQUEST_TIMEOUT_MS,
  effectiveEndpoint,
  readErrorBody,
} from "@/background/ai-client";
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
  if (!provider.endpoint || provider.endpoint.trim() === "") {
    throw new Error(`Endpoint URL required for ${provider.label}`);
  }
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
        throw new Error(
          `AI You: ${response.status} ${errBody}`.trim(),
        );
      }
      return await consumeSseStream(response);
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

export async function aiyouComplete(
  provider: AiProviderConfig,
  apiKey: string | undefined,
  system: string,
  userInput: string,
): Promise<string> {
  if (!apiKey) {
    throw new Error(`API key missing for ${provider.label}`);
  }
  if (!isAiyouModel(provider.model)) {
    throw new Error(
      `Unknown AI You model "${provider.model ?? ""}" for ${provider.label}`,
    );
  }
  return aiyouFetch(provider, apiKey, buildBody(provider.model, system, userInput));
}

// Test connection: same code path as production — minimal chat completion,
// SSE buffered, tools enabled. A 200 with non-empty buffered content = ok.
export async function aiyouTest(
  provider: AiProviderConfig,
  apiKey: string | undefined,
): Promise<string> {
  if (!apiKey) {
    throw new Error(`API key missing for ${provider.label}`);
  }
  if (!isAiyouModel(provider.model)) {
    throw new Error(
      `Unknown AI You model "${provider.model ?? ""}" for ${provider.label}`,
    );
  }
  await aiyouFetch(provider, apiKey, buildBody(provider.model, "", "ping"));
  return `Reached AI You. Model ${provider.model} responded.`;
}
