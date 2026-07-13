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

function plainResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
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

const baseProvider: AiProviderConfig = {
  id: "ollama-1",
  type: "ollama",
  label: "Ollama",
  endpoint: "",
  model: "llama3",
};

let adapter: typeof import("../../../src/background/ai-adapters/ollama").default;

beforeEach(async () => {
  installChromeStub();
  vi.resetModules();
  adapter = (await import("../../../src/background/ai-adapters/ollama")).default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ollama adapter — request", () => {
  it("POSTs the default localhost /api/generate with no auth header", async () => {
    const { calls } = recordFetch(jsonResponse({ response: "hi" }));
    await adapter.complete({
      provider: baseProvider,
      apiKey: undefined,
      system: "be terse",
      userInput: "hello",
    });
    expect(calls[0].url).toBe("http://localhost:11434/api/generate");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({
      model: "llama3",
      system: "be terse",
      prompt: "hello",
      stream: false,
    });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("ollama adapter — response", () => {
  it("returns the response field", async () => {
    recordFetch(jsonResponse({ response: "generated text" }));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({ ok: true, text: "generated text" });
  });

  it("errors with request_failed when response field is absent", async () => {
    recordFetch(jsonResponse({ done: true }));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "request_failed",
        message: "Unexpected response shape from Ollama",
      },
    });
  });
});

describe("ollama adapter — preflight + errors", () => {
  it("rejects an empty model without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.complete({
      provider: { ...baseProvider, model: "" },
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "request_failed", message: "Model name not set for Ollama" },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps a 500 to request_failed", async () => {
    recordFetch(plainResponse("model crashed", 500));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("request_failed");
      expect(result.error.message).toMatch(/^Ollama: 500/);
    }
  });
});

describe("ollama adapter — testConnection", () => {
  it("counts models from /api/tags and pluralizes", async () => {
    const { calls } = recordFetch(
      jsonResponse({ models: [{ name: "a" }, { name: "b" }, { name: "c" }] }),
    );
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: undefined,
    });
    expect(calls[0].url).toBe("http://localhost:11434/api/tags");
    expect(result).toEqual({
      ok: true,
      message: "Reached Ollama. 3 models available.",
    });
  });

  it("treats a non-array models field as zero", async () => {
    recordFetch(jsonResponse({}));
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: undefined,
    });
    expect(result).toEqual({
      ok: true,
      message: "Reached Ollama. 0 models available.",
    });
  });
});
