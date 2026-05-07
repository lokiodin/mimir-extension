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
import { adapters } from "@/background/ai-adapters";

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

    const result = await adapters[provider.type].complete({
      provider,
      apiKey,
      system,
      userInput: req.userInput,
    });
    if (!result.ok) {
      return { ok: false, error: result.error.message };
    }
    return {
      ok: true,
      response: result.text,
      providerLabel: describeProvider(provider),
      providerType: provider.type,
    };
  } catch (err) {
    return { ok: false, error: shapeError(err) };
  }
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

    const result = await adapters[provider.type].testConnection({
      provider,
      apiKey,
    });
    if (!result.ok) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, message: result.message };
  } catch (err) {
    return { ok: false, error: shapeError(err) };
  }
}
