import { afterEach, describe, expect, it, vi } from "vitest";

const captured: Array<{ system: string }> = [];

async function loadComplete() {
  vi.resetModules();
  captured.length = 0;

  vi.doMock("../../../src/storage/manager", () => ({
    getSettings: async () => ({
      aiProviders: [
        { id: "p1", type: "ollama", label: "Local", endpoint: "" },
      ],
      contextMenu: {},
    }),
    getApiKey: async () => undefined,
    getPrompt: async () => undefined, // forces PROMPT_DEFAULTS fallback
  }));

  vi.doMock("../../../src/background/ai-adapters", () => ({
    adapters: {
      ollama: {
        complete: async (req: { system: string }) => {
          captured.push({ system: req.system });
          return { ok: true, text: "RESP" };
        },
        testConnection: async () => ({ ok: true, message: "ok" }),
      },
    },
  }));

  const mod = await import("../../../src/background/ai-client");
  return mod.complete;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("../../../src/storage/manager");
  vi.doUnmock("../../../src/background/ai-adapters");
});

describe("complete() — language directive", () => {
  it("does not append the directive when language is omitted", async () => {
    const complete = await loadComplete();
    const res = await complete({
      type: "ai.complete",
      providerId: "p1",
      featureId: "log-analysis",
      userInput: "log line",
    });
    expect(res.ok).toBe(true);
    expect(captured[0].system).not.toContain("Write your entire response in French");
  });

  it("does not append the directive for English", async () => {
    const complete = await loadComplete();
    await complete({
      type: "ai.complete",
      providerId: "p1",
      featureId: "log-analysis",
      userInput: "log line",
      language: "en",
    });
    expect(captured[0].system).not.toContain("Write your entire response in French");
  });

  it("appends the French directive for French", async () => {
    const complete = await loadComplete();
    await complete({
      type: "ai.complete",
      providerId: "p1",
      featureId: "log-analysis",
      userInput: "log line",
      language: "fr",
    });
    expect(captured[0].system).toMatch(/\S/);
    expect(captured[0].system).toContain("Write your entire response in French");
    expect(captured[0].system).toContain("Do NOT translate technical or ambiguous terms");
  });
});
