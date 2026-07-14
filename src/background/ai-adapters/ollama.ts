// Ollama adapter. POST /api/generate with {model, system, prompt, stream:false}.
// No auth header. Test connection: GET /api/tags, count models[].

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

function classifyOllamaError(err: unknown): AiAdapterError {
  if (err instanceof Error) {
    const match = err.message.match(/^Ollama: (\d{3})/);
    if (match) {
      return {
        kind: mapHttpStatusToKind(parseInt(match[1], 10)),
        message: err.message,
      };
    }
    if (err.message.startsWith("Ollama: ")) {
      return { kind: "request_failed", message: err.message };
    }
    if (err.message === "Unexpected response shape from Ollama") {
      return { kind: "request_failed", message: err.message };
    }
    if (err.message.startsWith("Model name not set")) {
      return { kind: "request_failed", message: err.message };
    }
  }
  return {
    kind: mapFetchExceptionToKind(err),
    message: shapeFetchExceptionMessage(err),
  };
}

async function ollamaCompleteImpl(
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

async function ollamaTestImpl(provider: AiProviderConfig): Promise<string> {
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

const ollamaAdapter: AiAdapter = {
  id: "ollama",
  async complete(req: AiAdapterRequest): Promise<AiAdapterCompleteResult> {
    try {
      const text = await ollamaCompleteImpl(
        req.provider,
        req.system,
        req.userInput,
      );
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: classifyOllamaError(err) };
    }
  },
  async testConnection(
    req: AiAdapterTestRequest,
  ): Promise<AiAdapterTestResult> {
    try {
      const message = await ollamaTestImpl(req.provider);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: classifyOllamaError(err) };
    }
  },
};

export default ollamaAdapter;
