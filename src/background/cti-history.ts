// Unified CTI history store. See TECHNICAL_DESIGN.md §6 + §9.
// One entry per normalized indicator; per-provider results nested in
// `providers`. Newest-first by lastLookupAt. LRU at 100. Re-lookups update
// the existing entry in place and move it to the front.

import { storageGet, storageSet, withStorageLock } from "@/storage/manager";
import { canonicalizeIndicator } from "@/background/cti-types";
import type {
  CtiHistoryEntry,
  CtiProvider,
  CtiSummaryField,
  IndicatorType,
  ProviderResult,
  Verdict,
} from "@/background/cti-types";

const HISTORY_KEY = "cti.history";
export const CTI_HISTORY_MAX = 100;

interface HistoryShape {
  entries: CtiHistoryEntry[];
}

function isProviderResult(value: unknown): value is ProviderResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.verdict === "string" &&
    Array.isArray(v.summary) &&
    typeof v.lookedUpAt === "number" &&
    typeof v.staleAfter === "number"
  );
}

function isHistoryEntry(value: unknown): value is CtiHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.indicator !== "string") return false;
  if (typeof v.indicatorType !== "string") return false;
  if (typeof v.firstLookupAt !== "number") return false;
  if (typeof v.lastLookupAt !== "number") return false;
  if (typeof v.providers !== "object" || v.providers === null) return false;
  for (const slot of Object.values(v.providers as Record<string, unknown>)) {
    if (slot !== undefined && !isProviderResult(slot)) return false;
  }
  return true;
}

export async function getCtiHistory(): Promise<CtiHistoryEntry[]> {
  const raw = await storageGet<HistoryShape>(HISTORY_KEY);
  if (!raw || !Array.isArray(raw.entries)) return [];
  return raw.entries.filter(isHistoryEntry);
}

async function writeCtiHistory(entries: CtiHistoryEntry[]): Promise<void> {
  await storageSet(HISTORY_KEY, { entries } satisfies HistoryShape);
}

export interface UpsertSuccessArgs {
  indicator: string;
  indicatorType: IndicatorType;
  providerId: CtiProvider;
  query: string;
  verdict: Verdict;
  summary: CtiSummaryField[];
  response: unknown;
  lookedUpAt: number;
  staleAfter: number;
}

export interface UpsertErrorArgs {
  indicator: string;
  indicatorType: IndicatorType;
  providerId: CtiProvider;
  query: string;
  lookedUpAt: number;
  staleAfter: number;
  error: { kind: string; message: string };
}

export async function upsertProviderResult(
  args: UpsertSuccessArgs | UpsertErrorArgs,
): Promise<void> {
  // Serialize concurrent provider writes for the same history key — the UI
  // fans out three provider lookups in parallel; without this lock, two of
  // the three persisted slots would be lost to last-write-wins.
  return withStorageLock(HISTORY_KEY, async () => {
    const indicator = canonicalizeIndicator(args.indicator, args.indicatorType);
    const entries = await getCtiHistory();
    const existing = entries.find((e) => e.indicator === indicator);
    const others = entries.filter((e) => e.indicator !== indicator);

    const slot: ProviderResult =
      "error" in args
        ? {
            verdict: "error",
            summary: [],
            response: null,
            lookedUpAt: args.lookedUpAt,
            staleAfter: args.staleAfter,
            error: args.error,
          }
        : {
            verdict: args.verdict,
            summary: args.summary,
            response: args.response,
            lookedUpAt: args.lookedUpAt,
            staleAfter: args.staleAfter,
          };

    const updated: CtiHistoryEntry = existing
      ? {
          ...existing,
          lastLookupAt: args.lookedUpAt,
          providers: { ...existing.providers, [args.providerId]: slot },
        }
      : {
          indicator,
          indicatorType: args.indicatorType,
          query: args.query,
          firstLookupAt: args.lookedUpAt,
          lastLookupAt: args.lookedUpAt,
          providers: { [args.providerId]: slot },
        };

    const next = [updated, ...others];
    if (next.length > CTI_HISTORY_MAX) {
      next.length = CTI_HISTORY_MAX;
    }
    await writeCtiHistory(next);
  });
}

export async function clearCtiHistory(): Promise<void> {
  await writeCtiHistory([]);
}
