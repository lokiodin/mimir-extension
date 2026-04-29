import { beforeEach, describe, expect, it } from "vitest";
import type { CtiResult } from "../../../src/background/cti-types";

// In-memory chrome.storage.local stub installed on globalThis before
// importing the module under test.
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
let getCtiHistory: typeof import("../../../src/background/cti-history").getCtiHistory;
let upsertCtiHistory: typeof import("../../../src/background/cti-history").upsertCtiHistory;
let clearCtiHistory: typeof import("../../../src/background/cti-history").clearCtiHistory;
let CTI_HISTORY_MAX: number;

beforeEach(async () => {
  store = installChromeStub();
  // Re-import after stubbing chrome to avoid stale references.
  const mod = await import("../../../src/background/cti-history");
  getCtiHistory = mod.getCtiHistory;
  upsertCtiHistory = mod.upsertCtiHistory;
  clearCtiHistory = mod.clearCtiHistory;
  CTI_HISTORY_MAX = mod.CTI_HISTORY_MAX;
});

function makeEntry(overrides: Partial<CtiResult> = {}): CtiResult {
  return {
    provider: "virustotal",
    indicatorType: "ip",
    indicator: "8.8.8.8",
    query: "8.8.8.8",
    timestamp: 1_700_000_000_000,
    staleAfter: 1_700_000_000_000 + 3_600_000,
    verdict: "clean",
    summary: [{ label: "Malicious engines", value: "0 / 90" }],
    response: { ok: true },
    ...overrides,
  };
}

describe("cti-history", () => {
  it("returns an empty array when nothing is stored", async () => {
    expect(await getCtiHistory()).toEqual([]);
  });

  it("upserts a new entry to the front", async () => {
    await upsertCtiHistory(makeEntry({ indicator: "1.1.1.1" }));
    await upsertCtiHistory(makeEntry({ indicator: "8.8.8.8" }));
    const rows = await getCtiHistory();
    expect(rows.map((r) => r.indicator)).toEqual(["8.8.8.8", "1.1.1.1"]);
  });

  it("dedupes on (provider, indicatorType, indicator) and moves to front", async () => {
    await upsertCtiHistory(
      makeEntry({ indicator: "1.1.1.1", timestamp: 1 }),
    );
    await upsertCtiHistory(
      makeEntry({ indicator: "8.8.8.8", timestamp: 2 }),
    );
    // Re-lookup of 1.1.1.1 with newer timestamp.
    await upsertCtiHistory(
      makeEntry({ indicator: "1.1.1.1", timestamp: 3, verdict: "malicious" }),
    );
    const rows = await getCtiHistory();
    expect(rows.length).toBe(2);
    expect(rows[0]?.indicator).toBe("1.1.1.1");
    expect(rows[0]?.timestamp).toBe(3);
    expect(rows[0]?.verdict).toBe("malicious");
    expect(rows[1]?.indicator).toBe("8.8.8.8");
  });

  it("treats different providers as distinct rows for the same indicator", async () => {
    await upsertCtiHistory(makeEntry({ provider: "virustotal" }));
    await upsertCtiHistory(makeEntry({ provider: "abuseipdb" }));
    const rows = await getCtiHistory();
    expect(rows.length).toBe(2);
  });

  it("LRU-evicts the oldest entry when exceeding the cap", async () => {
    for (let i = 0; i < CTI_HISTORY_MAX; i++) {
      await upsertCtiHistory(
        makeEntry({ indicator: `10.0.0.${i}`, timestamp: i }),
      );
    }
    expect((await getCtiHistory()).length).toBe(CTI_HISTORY_MAX);
    // Add one more — first inserted (10.0.0.0) should be evicted.
    await upsertCtiHistory(
      makeEntry({ indicator: "10.0.1.0", timestamp: CTI_HISTORY_MAX }),
    );
    const rows = await getCtiHistory();
    expect(rows.length).toBe(CTI_HISTORY_MAX);
    expect(rows[0]?.indicator).toBe("10.0.1.0");
    expect(rows.find((r) => r.indicator === "10.0.0.0")).toBeUndefined();
  });

  it("clears all entries", async () => {
    await upsertCtiHistory(makeEntry({ indicator: "1.1.1.1" }));
    await upsertCtiHistory(makeEntry({ indicator: "2.2.2.2" }));
    await clearCtiHistory();
    expect(await getCtiHistory()).toEqual([]);
  });

  it("ignores malformed stored payloads gracefully", async () => {
    store.set("cti.history", "not an object");
    expect(await getCtiHistory()).toEqual([]);
  });
});
