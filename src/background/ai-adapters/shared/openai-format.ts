// Chat-completions request/response shape shared by the OpenAI and
// OpenAI-compatible adapters. Auth-header presence and required-checks are
// each adapter's concern; this helper only fetches and parses.

import type { AiProviderConfig } from "@/storage/types";
import { effectiveEndpoint } from "./endpoint";
import { readErrorBody, timedFetch } from "./http";

export async function openaiChatCompletion(
  provider: AiProviderConfig,
  apiKey: string | undefined,
  system: string,
  userInput: string,
  errorPrefix: string,
): Promise<string> {
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
    throw new Error(`${errorPrefix}: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`Unexpected response shape from ${errorPrefix}`);
  }
  return text;
}

export async function openaiListModelsCount(
  provider: AiProviderConfig,
  apiKey: string | undefined,
  errorPrefix: string,
): Promise<number> {
  const url = `${effectiveEndpoint(provider)}/v1/models`;
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await timedFetch({ url, method: "GET", headers });
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`${errorPrefix}: ${response.status} ${body}`.trim());
  }
  const data = (await response.json().catch(() => null)) as
    | { data?: unknown[] }
    | null;
  const models = data?.data;
  return Array.isArray(models) ? models.length : 0;
}
