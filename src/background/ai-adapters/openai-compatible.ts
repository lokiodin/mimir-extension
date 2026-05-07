// OpenAI-compatible adapter. Same wire format as OpenAI but with a
// user-supplied endpoint URL and an optional API key. Covers LocalAI,
// llama.cpp server, vLLM, LM Studio, and any other /v1/chat/completions
// host the user wants to point at.

import type {
  AiAdapter,
  AiAdapterCompleteResult,
  AiAdapterError,
  AiAdapterRequest,
  AiAdapterTestRequest,
  AiAdapterTestResult,
} from "./types";
import {
  openaiChatCompletion,
  openaiListModelsCount,
} from "./shared/openai-format";
import {
  mapFetchExceptionToKind,
  mapHttpStatusToKind,
  shapeFetchExceptionMessage,
} from "./shared/errors";
import type { AiProviderConfig } from "@/storage/types";

const ERROR_PREFIX = "openai-compatible";

function classifyError(err: unknown): AiAdapterError {
  if (err instanceof Error) {
    const match = err.message.match(/^openai-compatible: (\d{3})/);
    if (match) {
      return {
        kind: mapHttpStatusToKind(parseInt(match[1], 10)),
        message: err.message,
      };
    }
    if (err.message.startsWith("openai-compatible: ")) {
      return { kind: "request_failed", message: err.message };
    }
    if (err.message === "Unexpected response shape from openai-compatible") {
      return { kind: "request_failed", message: err.message };
    }
    if (
      err.message.startsWith("Model name not set") ||
      err.message.startsWith("Endpoint URL required")
    ) {
      return { kind: "request_failed", message: err.message };
    }
  }
  return {
    kind: mapFetchExceptionToKind(err),
    message: shapeFetchExceptionMessage(err),
  };
}

function preflight(
  provider: AiProviderConfig,
): { error: AiAdapterError } | null {
  if (!provider.model || provider.model.trim() === "") {
    return {
      error: {
        kind: "request_failed",
        message: `Model name not set for ${provider.label}`,
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
  return null;
}

const openaiCompatibleAdapter: AiAdapter = {
  id: "openai-compatible",
  async complete(req: AiAdapterRequest): Promise<AiAdapterCompleteResult> {
    const pf = preflight(req.provider);
    if (pf) return { ok: false, error: pf.error };
    try {
      const text = await openaiChatCompletion(
        req.provider,
        req.apiKey,
        req.system,
        req.userInput,
        ERROR_PREFIX,
      );
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: classifyError(err) };
    }
  },
  async testConnection(
    req: AiAdapterTestRequest,
  ): Promise<AiAdapterTestResult> {
    if (!req.provider.endpoint || req.provider.endpoint.trim() === "") {
      return {
        ok: false,
        error: {
          kind: "request_failed",
          message: `Endpoint URL required for ${req.provider.label}`,
        },
      };
    }
    try {
      const count = await openaiListModelsCount(
        req.provider,
        req.apiKey,
        ERROR_PREFIX,
      );
      return {
        ok: true,
        message: `Reached endpoint. ${count} model${count === 1 ? "" : "s"} available.`,
      };
    } catch (err) {
      return { ok: false, error: classifyError(err) };
    }
  },
};

export default openaiCompatibleAdapter;
