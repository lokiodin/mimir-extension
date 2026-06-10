import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/storage/types";

// In-memory chrome.storage.local stub installed on globalThis before the
// module under test is imported.
function installChromeStub(): Map<string, unknown> {
  const store = new Map<string, unknown>();
  const local = {
    get(key: string): Promise<Record<string, unknown>> {
      const value = store.get(key);
      return Promise.resolve(value === undefined ? {} : { [key]: value });
    },
    set(items: Record<string, unknown>): Promise<void> {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
      return Promise.resolve();
    },
    remove(key: string): Promise<void> {
      store.delete(key);
      return Promise.resolve();
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local },
  };
  return store;
}

let store: Map<string, unknown>;
let m: typeof import("../../../src/storage/manager");

beforeEach(async () => {
  store = installChromeStub();
  vi.resetModules();
  m = await import("../../../src/storage/manager");
});

describe("raw key access", () => {
  it("returns undefined for an absent key", async () => {
    expect(await m.storageGet("missing")).toBeUndefined();
  });

  it("round-trips set then get, and remove deletes", async () => {
    await m.storageSet("k", { a: 1 });
    expect(await m.storageGet("k")).toEqual({ a: 1 });
    await m.storageRemove("k");
    expect(await m.storageGet("k")).toBeUndefined();
  });
});

describe("settings", () => {
  it("returns the defaults when nothing is stored", async () => {
    expect(await m.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges a stored partial over the defaults", async () => {
    await m.storageSet("settings", { ctiTtlHours: 24 });
    expect(await m.getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      ctiTtlHours: 24,
    });
  });

  it("updateSettings patches without dropping earlier fields", async () => {
    await m.updateSettings({ ctiTtlHours: 12 });
    await m.updateSettings({ abusechMode: "api" });
    const settings = await m.getSettings();
    expect(settings.ctiTtlHours).toBe(12);
    expect(settings.abusechMode).toBe("api");
    expect(store.get("settings")).toMatchObject({
      ctiTtlHours: 12,
      abusechMode: "api",
    });
  });
});

describe("namespaced api keys and prompts", () => {
  it("stores API keys under apikeys.<provider>", async () => {
    await m.setApiKey("openai", "sk-1");
    expect(store.get("apikeys.openai")).toBe("sk-1");
    expect(await m.getApiKey("openai")).toBe("sk-1");
    await m.removeApiKey("openai");
    expect(await m.getApiKey("openai")).toBeUndefined();
  });

  it("stores prompts under prompts.<featureId>", async () => {
    await m.setPrompt("log-analysis", "be terse");
    expect(store.get("prompts.log-analysis")).toBe("be terse");
    expect(await m.getPrompt("log-analysis")).toBe("be terse");
    await m.removePrompt("log-analysis");
    expect(await m.getPrompt("log-analysis")).toBeUndefined();
  });
});

describe("withStorageLock", () => {
  it("returns the resolved value of the locked fn", async () => {
    expect(await m.withStorageLock("k", async () => 42)).toBe(42);
  });

  it("serializes concurrent read-modify-write on the same key", async () => {
    // Each op reads, yields a microtask (widening the race window), then
    // writes read+1. Unserialized, all three read 0 and the counter ends at
    // 1 (lost updates). The lock must force them to 3.
    const increment = () =>
      m.withStorageLock("counter", async () => {
        const cur = (await m.storageGet<number>("counter")) ?? 0;
        await Promise.resolve();
        await m.storageSet("counter", cur + 1);
      });
    await Promise.all([increment(), increment(), increment()]);
    expect(await m.storageGet<number>("counter")).toBe(3);
  });

  it("keeps the per-key chain alive after a locked fn rejects", async () => {
    const failing = m.withStorageLock("k", async () => {
      throw new Error("boom");
    });
    const next = m.withStorageLock("k", async () => "recovered");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("recovered");
  });
});
