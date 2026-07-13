import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderConfig } from "../../../src/storage/types";

function installChromeStub(): void {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getPlatformInfo: () => Promise.resolve({}),
    },
  };
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function recordFetch(response: Response): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const stub = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    stub as unknown as typeof fetch;
  return { calls };
}

function noFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    spy as unknown as typeof fetch;
  return spy;
}

function okCompletion(text: string): Response {
  return jsonResponse({ choices: [{ message: { content: text } }] });
}

const baseProvider: AiProviderConfig = {
  id: "compat-1",
  type: "openai-compatible",
  label: "Local LLM",
  endpoint: "https://local.test",
  model: "mistral",
};

let adapter: typeof import("../../../src/background/ai-adapters/openai-compatible").default;

beforeEach(async () => {
  installChromeStub();
  vi.resetModules();
  adapter = (
    await import("../../../src/background/ai-adapters/openai-compatible")
  ).default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openai-compatible adapter — endpoint + optional key", () => {
  it("routes to the user endpoint and omits Authorization when no key is set", async () => {
    const { calls } = recordFetch(okCompletion("ok"));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({ ok: true, text: "ok" });
    expect(calls[0].url).toBe("https://local.test/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("sends a Bearer header when a key is supplied", async () => {
    const { calls } = recordFetch(okCompletion("ok"));
    await adapter.complete({
      provider: baseProvider,
      apiKey: "local-key",
      system: "",
      userInput: "hi",
    });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer local-key");
  });
});

describe("openai-compatible adapter — preflight", () => {
  it("rejects an empty endpoint on complete without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.complete({
      provider: { ...baseProvider, endpoint: "" },
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "request_failed",
        message: "Endpoint URL required for Local LLM",
      },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an empty model on complete without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.complete({
      provider: { ...baseProvider, model: "" },
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "request_failed",
        message: "Model name not set for Local LLM",
      },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an empty endpoint on testConnection without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.testConnection({
      provider: { ...baseProvider, endpoint: "" },
      apiKey: undefined,
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "request_failed",
        message: "Endpoint URL required for Local LLM",
      },
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("openai-compatible adapter — testConnection", () => {
  it("reports a generic endpoint-reached message with the model count", async () => {
    recordFetch(jsonResponse({ data: [{ id: "a" }, { id: "b" }] }));
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: undefined,
    });
    expect(result).toEqual({
      ok: true,
      message: "Reached endpoint. 2 models available.",
    });
  });
});
