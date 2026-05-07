import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderConfig } from "../../../src/storage/types";

// Stub chrome.alarms for the keepalive module — same surface area as the
// real API, but a no-op so tests don't actually schedule anything.
function installChromeStub(): void {
  const noop = () => Promise.resolve();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    alarms: {
      create: noop,
      clear: noop,
      onAlarm: { addListener: () => {} },
    },
  };
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

function streamFromString(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function sseResponse(body: string, status = 200): Response {
  return new Response(streamFromString(body), {
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

const baseProvider: AiProviderConfig = {
  id: "aiyou-1",
  type: "aiyou",
  label: "AI You",
  endpoint: "https://example.test/api/v1",
  model: "aiyou-large-snc",
  authMode: "apikey",
};

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

let adapter: typeof import("../../../src/background/ai-adapters/aiyou").default;
let AIYOU_MODELS: typeof import("../../../src/background/ai-adapters/aiyou").AIYOU_MODELS;

// Thin shim to keep the existing test bodies as positional calls. The
// adapter returns a result object; tests assert on thrown errors / returned
// strings, so we unwrap here.
async function aiyouComplete(
  provider: AiProviderConfig,
  apiKey: string | undefined,
  system: string,
  userInput: string,
): Promise<string> {
  const result = await adapter.complete({ provider, apiKey, system, userInput });
  if (!result.ok) throw new Error(result.error.message);
  return result.text;
}

beforeEach(async () => {
  installChromeStub();
  vi.resetModules();
  const mod = await import("../../../src/background/ai-adapters/aiyou");
  adapter = mod.default;
  AIYOU_MODELS = mod.AIYOU_MODELS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aiyou adapter — request body", () => {
  it("wraps user input as a typed text part array", async () => {
    const { calls } = recordFetch(
      sseResponse(
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    await aiyouComplete(baseProvider, "secret-key", "", "hello world");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "hello world" }] },
    ]);
  });

  it("includes promptSystem when system prompt is non-empty", async () => {
    const { calls } = recordFetch(
      sseResponse(
        'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    await aiyouComplete(baseProvider, "secret-key", "be terse", "ping");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.promptSystem).toBe("be terse");
  });

  it("omits promptSystem when system prompt is empty", async () => {
    const { calls } = recordFetch(
      sseResponse(
        'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    await aiyouComplete(baseProvider, "secret-key", "", "ping");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).not.toHaveProperty("promptSystem");
  });

  it("always sets stream: true, tools: [163], executeToolsDirectly: true", async () => {
    const { calls } = recordFetch(
      sseResponse(
        'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    await aiyouComplete(baseProvider, "secret-key", "", "ping");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.stream).toBe(true);
    expect(body.tools).toEqual([163]);
    expect(body.executeToolsDirectly).toBe(true);
  });
});

describe("aiyou adapter — auth headers", () => {
  it("API Key mode sends X-API-KEY with full key including DGY_API: prefix", async () => {
    const { calls } = recordFetch(
      sseResponse(
        'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    await aiyouComplete(
      { ...baseProvider, authMode: "apikey" },
      "DGY_API:abc.def.ghi",
      "",
      "ping",
    );
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-API-KEY"]).toBe("DGY_API:abc.def.ghi");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("Bearer mode sends Authorization: Bearer <token> only", async () => {
    const { calls } = recordFetch(
      sseResponse(
        'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    await aiyouComplete(
      { ...baseProvider, authMode: "bearer" },
      "ey.jwt.token",
      "",
      "ping",
    );
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ey.jwt.token");
    expect(headers["X-API-KEY"]).toBeUndefined();
  });
});

describe("aiyou adapter — SSE parsing", () => {
  it("filters tool_execution events and assembles content deltas in order", async () => {
    const fixture = [
      'data: {"type":"tool_execution","tool_name":"date","status":"running"}',
      "",
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"type":"tool_execution","tool_name":"date","status":"completed"}',
      "",
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    recordFetch(sseResponse(fixture));
    const result = await aiyouComplete(
      baseProvider,
      "secret-key",
      "",
      "hi",
    );
    expect(result).toBe("Hello world");
  });

  it("returns assembled content when stream ends without [DONE] but had deltas", async () => {
    // Two valid SSE events separated by \n\n, then the stream closes — no [DONE].
    const fixture =
      'data: {"choices":[{"delta":{"content":"part"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"ial"}}]}\n\n';
    recordFetch(sseResponse(fixture));
    const result = await aiyouComplete(
      baseProvider,
      "secret-key",
      "",
      "hi",
    );
    expect(result).toBe("partial");
  });

  it("throws empty-response error when no content deltas arrive", async () => {
    const fixture = [
      'data: {"type":"tool_execution","tool_name":"date","status":"running"}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    recordFetch(sseResponse(fixture));
    await expect(
      aiyouComplete(baseProvider, "secret-key", "", "hi"),
    ).rejects.toThrow(/empty response/i);
  });
});

describe("aiyou adapter — errors", () => {
  it("401 surfaces with 'AI You: 401 ...' prefix", async () => {
    recordFetch(plainResponse("Invalid token", 401));
    await expect(
      aiyouComplete(baseProvider, "bad-key", "", "hi"),
    ).rejects.toThrow(/^AI You: 401/);
  });

  it("rejects unknown model synchronously without making a fetch call", async () => {
    const fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchSpy as unknown as typeof fetch;
    await expect(
      aiyouComplete(
        { ...baseProvider, model: "aiyou-xxl-pro" },
        "secret-key",
        "",
        "hi",
      ),
    ).rejects.toThrow(/Unknown AI You model/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects empty endpoint synchronously without making a fetch call", async () => {
    const fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchSpy as unknown as typeof fetch;
    await expect(
      aiyouComplete(
        { ...baseProvider, endpoint: "" },
        "secret-key",
        "",
        "hi",
      ),
    ).rejects.toThrow(/Endpoint URL required/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects missing API key synchronously without making a fetch call", async () => {
    const fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchSpy as unknown as typeof fetch;
    await expect(
      aiyouComplete(baseProvider, undefined, "", "hi"),
    ).rejects.toThrow(/API key missing/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("aiyou adapter — model list", () => {
  it("exposes exactly three hardcoded models", () => {
    expect(AIYOU_MODELS).toEqual([
      "aiyou-large-snc",
      "aiyou-medium-snc",
      "aiyou-small-snc",
    ]);
  });
});
