// Log Analysis history store. See TECHNICAL_DESIGN.md §8.
// FIFO at ANALYSIS_HISTORY_MAX. Each analysis is a fresh entry — no dedup.

import { storageGet, storageSet } from "@/storage/manager";
import type { AnalysisHistoryEntry } from "@/modules/analysis/types";

const HISTORY_KEY = "analysis.history";
export const ANALYSIS_HISTORY_MAX = 10;

interface HistoryShape {
  entries: AnalysisHistoryEntry[];
}

export async function getAnalysisHistory(): Promise<AnalysisHistoryEntry[]> {
  const raw = await storageGet<HistoryShape>(HISTORY_KEY);
  if (!raw || !Array.isArray(raw.entries)) return [];
  return raw.entries;
}

async function writeAnalysisHistory(
  entries: AnalysisHistoryEntry[],
): Promise<void> {
  await storageSet(HISTORY_KEY, { entries } satisfies HistoryShape);
}

export async function pushAnalysisHistory(
  entry: AnalysisHistoryEntry,
): Promise<void> {
  const entries = await getAnalysisHistory();
  const next = [entry, ...entries];
  if (next.length > ANALYSIS_HISTORY_MAX) {
    next.length = ANALYSIS_HISTORY_MAX;
  }
  await writeAnalysisHistory(next);
}

export async function clearAnalysisHistory(): Promise<void> {
  await writeAnalysisHistory([]);
}
