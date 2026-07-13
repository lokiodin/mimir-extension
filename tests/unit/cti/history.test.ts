import { beforeEach, describe, expect, it } from "vitest";
import type {
  CtiHistoryEntry,
  CtiProvider,
  IndicatorType,
} from "../../../src/background/cti-types";

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
let upsertProviderResult: typeof import("../../../src/background/cti-history").upsertProviderResult;
let clearCtiHistory: typeof import("../../../src/background/cti-history").clearCtiHistory;
let CTI_HISTORY_MAX: number;

beforeEach(async () => {
  store = installChromeStub();
  // Reset the module cache so the freshly stubbed chrome is picked up.
  const mod = await import("../../../src/background/cti-history");
  getCtiHistory = mod.getCtiHistory;
  upsertProviderResult = mod.upsertProviderResult;
  clearCtiHistory = mod.clearCtiHistory;
  CTI_HISTORY_MAX = mod.CTI_HISTORY_MAX;
});

interface SuccessOverrides {
  indicator?: string;
  indicatorType?: IndicatorType;
  providerId?: CtiProvider;
  query?: string;
  verdict?: "malicious" | "suspicious" | "clean" | "unknown";
  lookedUpAt?: number;
  staleAfter?: number;
  response?: unknown;
}

async function upsertSuccess(o: SuccessOverrides = {}): Promise<void> {
  const lookedUpAt = o.lookedUpAt ?? 1_700_000_000_000;
  await upsertProviderResult({
    indicator: o.indicator ?? "8.8.8.8",
    indicatorType: o.indicatorType ?? "ip",
    providerId: o.providerId ?? "virustotal",
    query: o.query ?? "8.8.8.8",
    verdict: o.verdict ?? "clean",
    summary: [{ label: "Malicious engines", value: "0 / 90" }],
    response: o.response ?? { ok: true },
    lookedUpAt,
    staleAfter: o.staleAfter ?? lookedUpAt + 3_600_000,
  });
}

describe("cti-history", () => {
  it("returns an empty array when nothing is stored", async () => {
    expect(await getCtiHistory()).toEqual([]);
  });

  it("creates a new entry on first lookup", async () => {
    await upsertSuccess({ indicator: "1.1.1.1" });
    const rows = await getCtiHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indicator).toBe("1.1.1.1");
    expect(rows[0]?.firstLookupAt).toBe(rows[0]?.lastLookupAt);
    expect(Object.keys(rows[0]?.providers ?? {})).toEqual(["virustotal"]);
  });

  it("canonicalizes non-URL indicators (lowercase, trim)", async () => {
    await upsertSuccess({ indicator: "  Example.COM  ", indicatorType: "domain" });
    const rows = await getCtiHistory();
    expect(rows[0]?.indicator).toBe("example.com");
  });

  it("preserves URL case (path/query are case-sensitive)", async () => {
    await upsertSuccess({
      indicator: "  https://example.com/Login?Token=AbC  ",
      indicatorType: "url",
    });
    const rows = await getCtiHistory();
    expect(rows[0]?.indicator).toBe("https://example.com/Login?Token=AbC");
  });

  it("collapses multiple providers for the same indicator into one entry", async () => {
    await upsertSuccess({ providerId: "virustotal", lookedUpAt: 1 });
    await upsertSuccess({ providerId: "abuseipdb", lookedUpAt: 2 });
    await upsertSuccess({ providerId: "abusech", lookedUpAt: 3 });
    const rows = await getCtiHistory();
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!.providers).sort()).toEqual([
      "abusech",
      "abuseipdb",
      "virustotal",
    ]);
    expect(rows[0]!.firstLookupAt).toBe(1);
    expect(rows[0]!.lastLookupAt).toBe(3);
  });

  it("re-lookup updates in place — firstLookupAt preserved, lastLookupAt advances", async () => {
    await upsertSuccess({ providerId: "virustotal", lookedUpAt: 100 });
    await upsertSuccess({ providerId: "abuseipdb", lookedUpAt: 200 });
    await upsertSuccess({
      providerId: "virustotal",
      lookedUpAt: 300,
      verdict: "malicious",
    });
    const rows = await getCtiHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.firstLookupAt).toBe(100);
    expect(rows[0]!.lastLookupAt).toBe(300);
    expect(rows[0]!.providers.virustotal?.verdict).toBe("malicious");
    expect(rows[0]!.providers.virustotal?.lookedUpAt).toBe(300);
    // The provider that wasn't re-run keeps its original timestamp.
    expect(rows[0]!.providers.abuseipdb?.lookedUpAt).toBe(200);
  });

  it("moves a re-looked-up entry to the front", async () => {
    await upsertSuccess({ indicator: "1.1.1.1", lookedUpAt: 1 });
    await upsertSuccess({ indicator: "8.8.8.8", lookedUpAt: 2 });
    await upsertSuccess({ indicator: "1.1.1.1", lookedUpAt: 3 });
    const rows = await getCtiHistory();
    expect(rows.map((r) => r.indicator)).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it("stores an error slot when a provider lookup fails", async () => {
    await upsertSuccess({ providerId: "virustotal" });
    await upsertProviderResult({
      indicator: "8.8.8.8",
      indicatorType: "ip",
      providerId: "abuseipdb",
      query: "8.8.8.8",
      lookedUpAt: 1_700_000_000_500,
      staleAfter: 1_700_000_000_500 + 3_600_000,
      error: { kind: "lookup_failed", message: "boom" },
    });
    const rows = await getCtiHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.providers.virustotal?.verdict).toBe("clean");
    expect(rows[0]!.providers.virustotal?.error).toBeUndefined();
    expect(rows[0]!.providers.abuseipdb?.verdict).toBe("error");
    expect(rows[0]!.providers.abuseipdb?.error?.message).toBe("boom");
  });

  it("LRU-evicts the indicator with the oldest lastLookupAt when exceeding the cap", async () => {
    for (let i = 0; i < CTI_HISTORY_MAX; i++) {
      await upsertSuccess({ indicator: `10.0.0.${i}`, lookedUpAt: i });
    }
    expect((await getCtiHistory()).length).toBe(CTI_HISTORY_MAX);
    // Add one more — first inserted (10.0.0.0, lastLookupAt 0) should be evicted.
    await upsertSuccess({
      indicator: "10.0.1.0",
      lookedUpAt: CTI_HISTORY_MAX,
    });
    const rows = await getCtiHistory();
    expect(rows.length).toBe(CTI_HISTORY_MAX);
    expect(rows[0]?.indicator).toBe("10.0.1.0");
    expect(rows.find((r) => r.indicator === "10.0.0.0")).toBeUndefined();
  });

  it("clears all entries", async () => {
    await upsertSuccess({ indicator: "1.1.1.1" });
    await upsertSuccess({ indicator: "2.2.2.2" });
    await clearCtiHistory();
    expect(await getCtiHistory()).toEqual([]);
  });

  it("ignores malformed stored payloads gracefully", async () => {
    store.set("cti.history", "not an object");
    expect(await getCtiHistory()).toEqual([]);
  });

  it("silently skips old-shape entries (per-(provider, indicator) rows)", async () => {
    const oldShape = {
      provider: "virustotal",
      indicatorType: "ip",
      indicator: "8.8.8.8",
      query: "8.8.8.8",
      timestamp: 1_700_000_000_000,
      staleAfter: 1_700_000_000_000 + 3_600_000,
      verdict: "clean",
      summary: [{ label: "x", value: "y" }],
      response: { ok: true },
    };
    const newShape: CtiHistoryEntry = {
      indicator: "1.1.1.1",
      indicatorType: "ip",
      query: "1.1.1.1",
      firstLookupAt: 1,
      lastLookupAt: 2,
      providers: {
        virustotal: {
          verdict: "clean",
          summary: [],
          response: null,
          lookedUpAt: 2,
          staleAfter: 2 + 3_600_000,
        },
      },
    };
    store.set("cti.history", { entries: [oldShape, newShape] });
    const rows = await getCtiHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indicator).toBe("1.1.1.1");
  });
});
