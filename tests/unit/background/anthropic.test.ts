import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderConfig } from "../../../src/storage/types";

// The adapter import chain reaches the keepalive module, whose interval
// ping calls chrome.runtime.getPlatformInfo. Stub it so a slow test run
// can't hit a missing API.
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
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
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

const baseProvider: AiProviderConfig = {
  id: "anthropic-1",
  type: "anthropic",
  label: "Claude",
  endpoint: "",
  model: "claude-opus-4-8",
};

let adapter: typeof import("../../../src/background/ai-adapters/anthropic").default;

beforeEach(async () => {
  installChromeStub();
  vi.resetModules();
  adapter = (await import("../../../src/background/ai-adapters/anthropic"))
    .default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("anthropic adapter — request", () => {
  it("POSTs /v1/messages with top-level system, user-only messages, and auth headers", async () => {
    const { calls } = recordFetch(
      jsonResponse({ content: [{ type: "text", text: "ok" }] }),
    );
    await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-ant-123",
      system: "be terse",
      userInput: "hello",
    });
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.max_tokens).toBe(4096);
    expect(body.system).toBe("be terse");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-123");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("trims a trailing slash from a custom endpoint", async () => {
    const { calls } = recordFetch(
      jsonResponse({ content: [{ type: "text", text: "ok" }] }),
    );
    await adapter.complete({
      provider: { ...baseProvider, endpoint: "https://proxy.test/anthropic/" },
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(calls[0].url).toBe("https://proxy.test/anthropic/v1/messages");
  });
});

describe("anthropic adapter — response extraction", () => {
  it("returns the text of the first text block", async () => {
    recordFetch(jsonResponse({ content: [{ type: "text", text: "answer" }] }));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({ ok: true, text: "answer" });
  });

  it("skips a non-text block and returns the following text block", async () => {
    recordFetch(
      jsonResponse({
        content: [
          { type: "tool_use", id: "t1", name: "x", input: {} },
          { type: "text", text: "after the tool" },
        ],
      }),
    );
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({ ok: true, text: "after the tool" });
  });

  it("errors with request_failed when no text block is present", async () => {
    recordFetch(jsonResponse({ content: [{ type: "tool_use", id: "t1" }] }));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "request_failed",
        message: "Unexpected response shape from Anthropic",
      },
    });
  });

  it("errors when the body is not JSON", async () => {
    recordFetch(plainResponse("<html>gateway</html>", 200));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(result.ok).toBe(false);
  });
});

describe("anthropic adapter — preflight short-circuits", () => {
  it("rejects an empty model without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.complete({
      provider: { ...baseProvider, model: "  " },
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "request_failed", message: "Model name not set for Claude" },
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
      error: { kind: "auth_failed", message: "API key missing for Claude" },
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("anthropic adapter — HTTP errors", () => {
  it("maps 401 to auth_failed", async () => {
    recordFetch(plainResponse("invalid key", 401));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "bad",
      system: "",
      userInput: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("auth_failed");
      expect(result.error.message).toMatch(/^Anthropic: 401/);
    }
  });

  it("maps 429 to rate_limited", async () => {
    recordFetch(plainResponse("slow down", 429));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("rate_limited");
  });

  it("maps 500 to request_failed", async () => {
    recordFetch(plainResponse("boom", 500));
    const result = await adapter.complete({
      provider: baseProvider,
      apiKey: "sk-ant-123",
      system: "",
      userInput: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("request_failed");
  });
});

describe("anthropic adapter — testConnection", () => {
  it("rejects a missing API key without fetching", async () => {
    const spy = noFetch();
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: undefined,
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "auth_failed", message: "API key missing for Claude" },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports the model count, pluralizing correctly", async () => {
    recordFetch(jsonResponse({ data: [{ id: "a" }, { id: "b" }] }));
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: "sk-ant-123",
    });
    expect(result).toEqual({
      ok: true,
      message: "Reached Anthropic. 2 models available.",
    });
  });

  it("uses the singular form for exactly one model", async () => {
    recordFetch(jsonResponse({ data: [{ id: "a" }] }));
    const result = await adapter.testConnection({
      provider: baseProvider,
      apiKey: "sk-ant-123",
    });
    expect(result).toEqual({
      ok: true,
      message: "Reached Anthropic. 1 model available.",
    });
  });
});
