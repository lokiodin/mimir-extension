// OpenAI adapter. Same wire format as openai-compatible but with the
// shipped api.openai.com default endpoint and a required API key.

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

const ERROR_PREFIX = "openai";

function classifyError(err: unknown): AiAdapterError {
  if (err instanceof Error) {
    const match = err.message.match(/^openai: (\d{3})/);
    if (match) {
      return {
        kind: mapHttpStatusToKind(parseInt(match[1], 10)),
        message: err.message,
      };
    }
    if (err.message.startsWith("openai: ")) {
      return { kind: "request_failed", message: err.message };
    }
    if (err.message === "Unexpected response shape from openai") {
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
  requireApiKey: boolean,
): { error: AiAdapterError } | null {
  if (!provider.model || provider.model.trim() === "") {
    return {
      error: {
        kind: "request_failed",
        message: `Model name not set for ${provider.label}`,
      },
    };
  }
  if (requireApiKey && !apiKey) {
    return {
      error: {
        kind: "auth_failed",
        message: `API key missing for ${provider.label}`,
      },
    };
  }
  return null;
}

const openaiAdapter: AiAdapter = {
  id: "openai",
  async complete(req: AiAdapterRequest): Promise<AiAdapterCompleteResult> {
    const pf = preflight(req.provider, req.apiKey, true);
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
      const count = await openaiListModelsCount(
        req.provider,
        req.apiKey,
        ERROR_PREFIX,
      );
      return {
        ok: true,
        message: `Reached OpenAI. ${count} model${count === 1 ? "" : "s"} available.`,
      };
    } catch (err) {
      return { ok: false, error: classifyError(err) };
    }
  },
};

export default openaiAdapter;
