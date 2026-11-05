// Log Analysis history store. See TECHNICAL_DESIGN.md §8.
// FIFO at ANALYSIS_HISTORY_MAX. Each analysis is a fresh entry — no dedup.

import { storageGet, storageSet, withStorageLock } from "@/storage/manager";
import type { AnalysisHistoryEntry } from "@/modules/analysis/types";
import type { AiCompleteResponse } from "@/background/ai-types";
import type { AiProviderConfig } from "@/storage/types";

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

// Shared by the popup and right-click paths so both record failures, not just
// successes (TD §8: failed analyses are history entries with `error: true`).
// `provider` labels failed entries; successes use the SW-resolved label.
export function buildAnalysisEntry(
  input: string,
  result: AiCompleteResponse,
  provider: Pick<AiProviderConfig, "label" | "type"> | undefined,
): AnalysisHistoryEntry {
  const base = { id: crypto.randomUUID(), timestamp: Date.now(), input };
  if (result.ok) {
    return {
      ...base,
      response: result.response,
      providerLabel: result.providerLabel,
      providerType: result.providerType,
    };
  }
  return {
    ...base,
    response: result.error,
    providerLabel: provider?.label ?? "(unknown)",
    providerType: provider?.type ?? "ollama",
    error: true,
  };
}

export async function pushAnalysisHistory(
  entry: AnalysisHistoryEntry,
): Promise<void> {
  // Serialize concurrent pushes (e.g. two right-click runs completing close
  // together) so neither baseline read drops the other's entry.
  return withStorageLock(HISTORY_KEY, async () => {
    const entries = await getAnalysisHistory();
    const next = [entry, ...entries];
    if (next.length > ANALYSIS_HISTORY_MAX) {
      next.length = ANALYSIS_HISTORY_MAX;
    }
    await writeAnalysisHistory(next);
  });
}

export async function clearAnalysisHistory(): Promise<void> {
  await writeAnalysisHistory([]);
}
