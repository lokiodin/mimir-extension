import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisHistoryEntry } from "../../../src/modules/analysis/types";
import { ANALYSIS_OPEN_ON_NEXT_POPUP_KEY } from "../../../src/modules/analysis/types";

interface ExtensionContext {
  contextType: string;
  documentUrl?: string;
}

interface ChromeStubOptions {
  contexts?: ExtensionContext[];
  contextsUndefined?: boolean;
  openPopupThrows?: boolean;
}

interface ChromeStub {
  storage: Map<string, unknown>;
  openPopupCalls: number;
  setBadgeTextCalls: Array<{ text: string }>;
}

function installChromeStub(opts: ChromeStubOptions = {}): ChromeStub {
  const storage = new Map<string, unknown>();
  const stub: ChromeStub = {
    storage,
    openPopupCalls: 0,
    setBadgeTextCalls: [],
  };

  const runtime: Record<string, unknown> = {
    getURL: (path: string) => `chrome-extension://abc/${path}`,
    getPlatformInfo: async () => ({}),
  };
  if (!opts.contextsUndefined) {
    runtime.getContexts = vi.fn(async () => opts.contexts ?? []);
  }

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime,
    storage: {
      local: {
        get: async (keys: string | string[] | Record<string, unknown>) => {
          if (typeof keys === "string") {
            const v = storage.get(keys);
            return v === undefined ? {} : { [keys]: v };
          }
          if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const k of keys) {
              if (storage.has(k)) out[k] = storage.get(k);
            }
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
      openPopup: vi.fn(async () => {
        stub.openPopupCalls += 1;
        if (opts.openPopupThrows) throw new Error("openPopup refused");
      }),
      setBadgeText: vi.fn(async (args: { text: string }) => {
        stub.setBadgeTextCalls.push(args);
      }),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
  };

  return stub;
}

interface MockSettings {
  aiProviders: Array<{ id: string; type: string; label: string }>;
  defaultAiProviderId?: string;
  contextMenu: Record<string, boolean>;
  lastPopupOpenedTs?: number;
}

function seedSettings(stub: ChromeStub, settings: Partial<MockSettings>): void {
  stub.storage.set("settings", {
    aiProviders: [],
    contextMenu: {},
    ...settings,
  });
}

async function loadRunner(completeImpl?: typeof Promise.resolve) {
  vi.resetModules();
  vi.doMock("../../../src/background/ai-client", () => ({
    complete:
      completeImpl ??
      vi.fn(async () => ({
        ok: true,
        response: "ANALYZED",
        providerLabel: "Test Provider",
        providerType: "ollama",
      })),
  }));
  const { runAnalysisInBackground } = await import(
    "../../../src/modules/analysis/background"
  );
  return runAnalysisInBackground;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("../../../src/background/ai-client");
});

describe("runAnalysisInBackground — auto-open marker", () => {
  it("writes marker and calls openPopup when no Mimir surface is open", async () => {
    const stub = installChromeStub({ contexts: [] });
    seedSettings(stub, {
      aiProviders: [
        { id: "p1", type: "ollama", label: "Local" },
      ],
      defaultAiProviderId: "p1",
    });
    const run = await loadRunner();
    await run("some log line");

    expect(stub.openPopupCalls).toBe(1);
    const marker = stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY) as
      | { entryId: string; ts: number }
      | undefined;
    expect(marker).toBeDefined();
    expect(typeof marker?.entryId).toBe("string");
    expect(typeof marker?.ts).toBe("number");

    const history = stub.storage.get("analysis.history") as {
      entries: AnalysisHistoryEntry[];
    };
    expect(history.entries[0].id).toBe(marker?.entryId);
  });

  it("skips marker + openPopup when a popup surface is open", async () => {
    const stub = installChromeStub({
      contexts: [
        {
          contextType: "POPUP",
          documentUrl: "chrome-extension://abc/popup.html",
        },
      ],
    });
    seedSettings(stub, {
      aiProviders: [{ id: "p1", type: "ollama", label: "Local" }],
      defaultAiProviderId: "p1",
    });
    const run = await loadRunner();
    await run("some log line");

    expect(stub.openPopupCalls).toBe(0);
    expect(stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY)).toBeUndefined();
    // History still written.
    const history = stub.storage.get("analysis.history") as {
      entries: AnalysisHistoryEntry[];
    };
    expect(history.entries).toHaveLength(1);
  });

  it("skips marker + openPopup when standalone window is open", async () => {
    const stub = installChromeStub({
      contexts: [
        {
          contextType: "TAB",
          documentUrl: "chrome-extension://abc/window.html",
        },
      ],
    });
    seedSettings(stub, {
      aiProviders: [{ id: "p1", type: "ollama", label: "Local" }],
      defaultAiProviderId: "p1",
    });
    const run = await loadRunner();
    await run("some log line");

    expect(stub.openPopupCalls).toBe(0);
    expect(stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY)).toBeUndefined();
  });

  it("skips when getContexts is unavailable (conservative)", async () => {
    const stub = installChromeStub({ contextsUndefined: true });
    seedSettings(stub, {
      aiProviders: [{ id: "p1", type: "ollama", label: "Local" }],
      defaultAiProviderId: "p1",
    });
    const run = await loadRunner();
    await run("some log line");

    expect(stub.openPopupCalls).toBe(0);
    expect(stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY)).toBeUndefined();
  });

  it("writes marker even when openPopup throws (history is durable)", async () => {
    const stub = installChromeStub({
      contexts: [],
      openPopupThrows: true,
    });
    seedSettings(stub, {
      aiProviders: [{ id: "p1", type: "ollama", label: "Local" }],
      defaultAiProviderId: "p1",
    });
    const run = await loadRunner();

    await expect(run("some log line")).resolves.toBeUndefined();

    expect(stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY)).toBeDefined();
    const history = stub.storage.get("analysis.history") as {
      entries: AnalysisHistoryEntry[];
    };
    expect(history.entries).toHaveLength(1);
  });

  it("last-write-wins on marker for two analyses in succession", async () => {
    const stub = installChromeStub({ contexts: [] });
    seedSettings(stub, {
      aiProviders: [{ id: "p1", type: "ollama", label: "Local" }],
      defaultAiProviderId: "p1",
    });
    const run = await loadRunner();

    await run("first");
    const firstMarker = stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY) as {
      entryId: string;
    };

    await run("second");
    const secondMarker = stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY) as {
      entryId: string;
    };

    expect(secondMarker.entryId).not.toBe(firstMarker.entryId);
    expect(stub.openPopupCalls).toBe(2);

    const history = stub.storage.get("analysis.history") as {
      entries: AnalysisHistoryEntry[];
    };
    // Newest first.
    expect(history.entries[0].id).toBe(secondMarker.entryId);
  });

  it("writes error entry + still attempts auto-open when no provider configured", async () => {
    const stub = installChromeStub({ contexts: [] });
    seedSettings(stub, {
      aiProviders: [], // no providers
    });
    const run = await loadRunner();
    await run("some log line");

    const history = stub.storage.get("analysis.history") as {
      entries: AnalysisHistoryEntry[];
    };
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].error).toBe(true);
    expect(stub.openPopupCalls).toBe(1);
    const marker = stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY) as
      | { entryId: string }
      | undefined;
    expect(marker?.entryId).toBe(history.entries[0].id);
  });

  it("ignores empty selection — no history, no marker, no openPopup", async () => {
    const stub = installChromeStub({ contexts: [] });
    seedSettings(stub, {
      aiProviders: [{ id: "p1", type: "ollama", label: "Local" }],
      defaultAiProviderId: "p1",
    });
    const run = await loadRunner();
    await run("   ");

    expect(stub.openPopupCalls).toBe(0);
    expect(stub.storage.get(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY)).toBeUndefined();
    expect(stub.storage.get("analysis.history")).toBeUndefined();
  });
});
