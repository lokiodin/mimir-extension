// Unified CTI history store. See TECHNICAL_DESIGN.md §6 + §9.
// One row per (provider, indicatorType, indicator). Newest-first. LRU at 100.
// A new lookup of an existing key updates the row in place and moves it to
// the front, rather than creating a duplicate.

import { storageGet, storageSet } from "@/storage/manager";
import type { CtiResult } from "@/background/cti-types";

const HISTORY_KEY = "cti.history";
export const CTI_HISTORY_MAX = 100;

interface HistoryShape {
  entries: CtiResult[];
}

function dedupKey(
  provider: CtiResult["provider"],
  indicatorType: CtiResult["indicatorType"],
  indicator: string,
): string {
  return `${provider}:${indicatorType}:${indicator}`;
}

export async function getCtiHistory(): Promise<CtiResult[]> {
  const raw = await storageGet<HistoryShape>(HISTORY_KEY);
  if (!raw || !Array.isArray(raw.entries)) return [];
  return raw.entries;
}

async function writeCtiHistory(entries: CtiResult[]): Promise<void> {
  await storageSet(HISTORY_KEY, { entries } satisfies HistoryShape);
}

export async function upsertCtiHistory(entry: CtiResult): Promise<void> {
  const entries = await getCtiHistory();
  const key = dedupKey(entry.provider, entry.indicatorType, entry.indicator);
  const without = entries.filter(
    (e) => dedupKey(e.provider, e.indicatorType, e.indicator) !== key,
  );
  const next = [entry, ...without];
  if (next.length > CTI_HISTORY_MAX) {
    next.length = CTI_HISTORY_MAX;
  }
  await writeCtiHistory(next);
}

export async function clearCtiHistory(): Promise<void> {
  await writeCtiHistory([]);
}
