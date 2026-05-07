// AI client — adapter-based dispatcher. See TECHNICAL_DESIGN.md §7.
// Resolves the active provider, the API key, and the system prompt, then
// dispatches to the per-provider adapter under src/background/ai-adapters/.
// Standard async to callers — adapters that stream buffer internally.

import { resolvePrompt } from "@/prompts";
import { getApiKey, getSettings } from "@/storage/manager";
import type { AiProviderConfig } from "@/storage/types";
import type {
  AiCompleteRequest,
  AiCompleteResponse,
  AiTestConnectionRequest,
  AiTestConnectionResponse,
} from "@/background/ai-types";
import { effectiveEndpoint } from "@/background/ai-adapters/shared/endpoint";
import {
  REQUEST_TIMEOUT_MS,
  readErrorBody,
  timedFetch,
} from "@/background/ai-adapters/shared/http";
import aiyouAdapter from "@/background/ai-adapters/aiyou";

// Re-export shared helpers for any in-tree consumers that still import them
// from here. Will be removed once all adapters are migrated.
export { effectiveEndpoint, REQUEST_TIMEOUT_MS, readErrorBody };

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MAX_TOKENS = 4096;

function describeProvider(provider: AiProviderConfig): string {
  const parts: string[] = [provider.type];
  if (provider.model && provider.model.trim() !== "") {
    parts.push(provider.model);
  }
  return parts.join(" ");
}

async function getProvider(
  providerId: string,
): Promise<AiProviderConfig | undefined> {
  const settings = await getSettings();
  return settings.aiProviders.find((p) => p.id === providerId);
}

function shapeError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Request timed out after 4 minutes";
  }
  if (err instanceof TypeError) {
    return `Could not reach AI endpoint: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// ---------- complete adapters (still inline; migrating one at a time) ----------

async function ollamaComplete(
  provider: AiProviderConfig,
  system: string,
  userInput: string,
): Promise<string> {
  if (!provider.model || provider.model.trim() === "") {
    throw new Error(`Model name not set for ${provider.label}`);
  }
  const url = `${effectiveEndpoint(provider)}/api/generate`;
  const response = await timedFetch({
    url,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      system,
      prompt: userInput,
      stream: false,
    }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Ollama: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { response?: string }
    | null;
  const text = data?.response;
  if (typeof text !== "string") {
    throw new Error("Unexpected response shape from Ollama");
  }
  return text;
}

async function openaiComplete(
  provider: AiProviderConfig,
  apiKey: string | undefined,
  system: string,
  userInput: string,
): Promise<string> {
  if (!provider.model || provider.model.trim() === "") {
    throw new Error(`Model name not set for ${provider.label}`);
  }
  if (provider.type === "openai" && !apiKey) {
    throw new Error(`API key missing for ${provider.label}`);
  }
  if (
    provider.type === "openai-compatible" &&
    (!provider.endpoint || provider.endpoint.trim() === "")
  ) {
    throw new Error(`Endpoint URL required for ${provider.label}`);
  }
  const url = `${effectiveEndpoint(provider)}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await timedFetch({
    url,
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userInput },
      ],
      stream: false,
    }),
  });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`${provider.type}: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`Unexpected response shape from ${provider.type}`);
  }
  return text;
}

async function anthropicComplete(
  provider: AiProviderConfig,
  apiKey: string | undefined,
  system: string,
  userInput: string,
): Promise<string> {
  if (!provider.model || provider.model.trim() === "") {
    throw new Error(`Model name not set for ${provider.label}`);
  }
  if (!apiKey) {
    throw new Error(`API key missing for ${provider.label}`);
  }
  const url = `${effectiveEndpoint(provider)}/v1/messages`;
  const response = await timedFetch({
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
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

export async function complete(
  req: AiCompleteRequest,
): Promise<AiCompleteResponse> {
  try {
    const provider = await getProvider(req.providerId);
    if (!provider) {
      return { ok: false, error: "Provider not configured" };
    }
    const system = await resolvePrompt(req.featureId);
    const apiKeyRaw = await getApiKey(`ai.${provider.id}`);
    const apiKey =
      apiKeyRaw && apiKeyRaw.trim() !== "" ? apiKeyRaw : undefined;

    let response: string;
    switch (provider.type) {
      case "ollama":
        response = await ollamaComplete(provider, system, req.userInput);
        break;
      case "openai":
      case "openai-compatible":
        response = await openaiComplete(
          provider,
          apiKey,
          system,
          req.userInput,
        );
        break;
      case "anthropic":
        response = await anthropicComplete(
          provider,
          apiKey,
          system,
          req.userInput,
        );
        break;
      case "aiyou": {
        const result = await aiyouAdapter.complete({
          provider,
          apiKey,
          system,
          userInput: req.userInput,
        });
        if (!result.ok) throw new Error(result.error.message);
        response = result.text;
        break;
      }
    }
    return {
      ok: true,
      response,
      providerLabel: describeProvider(provider),
      providerType: provider.type,
    };
  } catch (err) {
    return { ok: false, error: shapeError(err) };
  }
}

// ---------- testConnection adapters ----------

async function ollamaTest(provider: AiProviderConfig): Promise<string> {
  const url = `${effectiveEndpoint(provider)}/api/tags`;
  const response = await timedFetch({ url, method: "GET", headers: {} });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Ollama: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { models?: unknown[] }
    | null;
  const models = data?.models;
  const count = Array.isArray(models) ? models.length : 0;
  return `Reached Ollama. ${count} model${count === 1 ? "" : "s"} available.`;
}

async function openaiTest(
  provider: AiProviderConfig,
  apiKey: string | undefined,
): Promise<string> {
  if (provider.type === "openai" && !apiKey) {
    throw new Error(`API key missing for ${provider.label}`);
  }
  if (
    provider.type === "openai-compatible" &&
    (!provider.endpoint || provider.endpoint.trim() === "")
  ) {
    throw new Error(`Endpoint URL required for ${provider.label}`);
  }
  const url = `${effectiveEndpoint(provider)}/v1/models`;
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await timedFetch({ url, method: "GET", headers });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`${provider.type}: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { data?: unknown[] }
    | null;
  const models = data?.data;
  const count = Array.isArray(models) ? models.length : 0;
  const label = provider.type === "openai" ? "OpenAI" : "endpoint";
  return `Reached ${label}. ${count} model${count === 1 ? "" : "s"} available.`;
}

async function anthropicTest(
  provider: AiProviderConfig,
  apiKey: string | undefined,
): Promise<string> {
  if (!apiKey) {
    throw new Error(`API key missing for ${provider.label}`);
  }
  const url = `${effectiveEndpoint(provider)}/v1/models`;
  const response = await timedFetch({
    url,
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
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

export async function testConnection(
  req: AiTestConnectionRequest,
): Promise<AiTestConnectionResponse> {
  try {
    const provider = await getProvider(req.providerId);
    if (!provider) {
      return { ok: false, error: "Provider not configured" };
    }
    const apiKeyRaw = await getApiKey(`ai.${provider.id}`);
    const apiKey =
      apiKeyRaw && apiKeyRaw.trim() !== "" ? apiKeyRaw : undefined;

    let message: string;
    switch (provider.type) {
      case "ollama":
        message = await ollamaTest(provider);
        break;
      case "openai":
      case "openai-compatible":
        message = await openaiTest(provider, apiKey);
        break;
      case "anthropic":
        message = await anthropicTest(provider, apiKey);
        break;
      case "aiyou": {
        const result = await aiyouAdapter.testConnection({ provider, apiKey });
        if (!result.ok) throw new Error(result.error.message);
        message = result.message;
        break;
      }
    }
    return { ok: true, message };
  } catch (err) {
    return { ok: false, error: shapeError(err) };
  }
}
