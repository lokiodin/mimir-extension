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

function okCompletion(text: string): Response {
  return jsonResponse({ choices: [{ message: { content: text } }] });
}

const baseProvider: AiProviderConfig = {
  id: "openai-1",
  type: "openai",
  label: "OpenAI",
  endpoint: "",
  model: "gpt-4o",
};

let adapter: typeof import("../../../src/background/ai-adapters/openai").default;

beforeEach(async () => {
  installChromeStub();
  vi.resetModules();
  adapter = (await import("../../../src/background/ai-adapters/openai")).default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openai adapter — request", () => {
  it("POSTs the default /v1/chat/completions with a Bearer header and system+user messages", async () => {
    const { calls } = recordFetch(okCompletion("ok"));
    await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-123",
      system: "be terse",
      userInput: "hello",
    });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "hello" },
    ]);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-123");
  });
});

describe("openai adapter — response", () => {
  it("returns choices[0].message.content", async () => {
    recordFetch(okCompletion("the answer"));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-123",
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({ ok: true, text: "the answer" });
  });

  it("errors with request_failed when the choice content is missing", async () => {
    recordFetch(jsonResponse({ choices: [{}] }));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-123",
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "request_failed",
        message: "Unexpected response shape from openai",
      },
    });
  });
});

describe("openai adapter — preflight", () => {
  it("rejects an empty model without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.complete({
      provider: { ...baseProvider, model: "" },
      apiKey: "sk-123",
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "request_failed", message: "Model name not set for OpenAI" },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a missing API key without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: undefined,
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "auth_failed", message: "API key missing for OpenAI" },
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("openai adapter — HTTP errors", () => {
  it.each([
    [401, "auth_failed"],
    [429, "rate_limited"],
    [500, "request_failed"],
  ])("maps %i to %s", async (status, kind) => {
    recordFetch(plainResponse("err", status));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-123",
      system: "",
      userInput: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe(kind);
  });
});

describe("openai adapter — testConnection", () => {
  it("rejects a missing API key without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: undefined,
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "auth_failed", message: "API key missing for OpenAI" },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports the model count from /v1/models", async () => {
    const { calls } = recordFetch(jsonResponse({ data: [{ id: "a" }] }));
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: "sk-123",
    });
    expect(calls[0].url).toBe("https://api.openai.com/v1/models");
    expect(result).toEqual({
      ok: true,
      message: "Reached OpenAI. 1 model available.",
    });
  });
});
