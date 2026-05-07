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
import aiyouAdapter from "@/background/ai-adapters/aiyou";
import ollamaAdapter from "@/background/ai-adapters/ollama";
import openaiCompatibleAdapter from "@/background/ai-adapters/openai-compatible";
import openaiAdapter from "@/background/ai-adapters/openai";
import anthropicAdapter from "@/background/ai-adapters/anthropic";

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
      case "ollama": {
        const result = await ollamaAdapter.complete({
          provider,
          apiKey,
          system,
          userInput: req.userInput,
        });
        if (!result.ok) throw new Error(result.error.message);
        response = result.text;
        break;
      }
      case "openai": {
        const result = await openaiAdapter.complete({
          provider,
          apiKey,
          system,
          userInput: req.userInput,
        });
        if (!result.ok) throw new Error(result.error.message);
        response = result.text;
        break;
      }
      case "openai-compatible": {
        const result = await openaiCompatibleAdapter.complete({
          provider,
          apiKey,
          system,
          userInput: req.userInput,
        });
        if (!result.ok) throw new Error(result.error.message);
        response = result.text;
        break;
      }
      case "anthropic": {
        const result = await anthropicAdapter.complete({
          provider,
          apiKey,
          system,
          userInput: req.userInput,
        });
        if (!result.ok) throw new Error(result.error.message);
        response = result.text;
        break;
      }
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
      case "ollama": {
        const result = await ollamaAdapter.testConnection({ provider, apiKey });
        if (!result.ok) throw new Error(result.error.message);
        message = result.message;
        break;
      }
      case "openai": {
        const result = await openaiAdapter.testConnection({ provider, apiKey });
        if (!result.ok) throw new Error(result.error.message);
        message = result.message;
        break;
      }
      case "openai-compatible": {
        const result = await openaiCompatibleAdapter.testConnection({
          provider,
          apiKey,
        });
        if (!result.ok) throw new Error(result.error.message);
        message = result.message;
        break;
      }
      case "anthropic": {
        const result = await anthropicAdapter.testConnection({
          provider,
          apiKey,
        });
        if (!result.ok) throw new Error(result.error.message);
        message = result.message;
        break;
      }
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
