import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ChromeStub {
  storage: Map<string, unknown>;
}

function installChromeStub(): ChromeStub {
  const storage = new Map<string, unknown>();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getURL: (p: string) => `chrome-extension://abc/${p}`,
      getContexts: vi.fn(async () => []),
    },
    storage: {
      local: {
        get: async (keys: string | string[] | Record<string, unknown>) => {
          if (typeof keys === "string") {
            const v = storage.get(keys);
            return v === undefined ? {} : { [keys]: v };
          }
          if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (storage.has(k)) out[k] = storage.get(k);
            return out;
          }
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(keys)) {
            out[k] = storage.has(k) ? storage.get(k) : keys[k];
          }
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) storage.set(k, v);
        },
        remove: async (key: string) => {
          storage.delete(key);
        },
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    action: {
      openPopup: vi.fn(async () => {}),
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    alarms: {
      create: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      onAlarm: { addListener: () => {} },
    },
  };
  return { storage };
}

const completeCalls: Array<{ language?: string }> = [];

async function loadRunner() {
  vi.resetModules();
  vi.doMock("../../../src/background/ai-client", () => ({
    complete: vi.fn(async (req: { language?: string }) => {
      completeCalls.push({ language: req.language });
      return {
        ok: true,
        response: "ANALYZED",
        providerLabel: "Test",
        providerType: "ollama",
      };
    }),
  }));
  const { runAnalysisInBackground } = await import(
    "../../../src/modules/analysis/background"
  );
  return runAnalysisInBackground;
}

function seedSettings(
  stub: ChromeStub,
  extra: Record<string, unknown>,
): void {
  stub.storage.set("settings", {
    aiProviders: [{ id: "p1", type: "ollama", label: "Local", endpoint: "" }],
    defaultAiProviderId: "p1",
    contextMenu: {},
    ...extra,
  });
}

beforeEach(() => {
  vi.resetModules();
  completeCalls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("../../../src/background/ai-client");
});

describe("runAnalysisInBackground — language", () => {
  it("passes 'en' to complete() when logAnalysisLanguage is unset", async () => {
    const stub = installChromeStub();
    seedSettings(stub, {});
    const run = await loadRunner();
    await run("some log line");
    expect(completeCalls[0].language).toBe("en");
  });

  it("passes 'fr' to complete() when logAnalysisLanguage is 'fr'", async () => {
    const stub = installChromeStub();
    seedSettings(stub, { logAnalysisLanguage: "fr" });
    const run = await loadRunner();
    await run("some log line");
    expect(completeCalls[0].language).toBe("fr");
  });
});
