import type {
  CtiHistoryEntry,
  ProviderResult,
  Verdict,
} from "@/background/cti-types";

const RANK: Record<Exclude<Verdict, "error">, number> = {
  malicious: 4,
  suspicious: 3,
  unknown: 2,
  clean: 1,
};

export function aggregateVerdict(entry: CtiHistoryEntry): Verdict {
  let best: Verdict = "unknown";
  let bestRank = -1;
  let saw = false;
  for (const slot of Object.values(entry.providers) as ProviderResult[]) {
    if (!slot || slot.error || slot.verdict === "error") continue;
    saw = true;
    const rank = RANK[slot.verdict as Exclude<Verdict, "error">];
    if (rank > bestRank) {
      bestRank = rank;
      best = slot.verdict;
    }
  }
  return saw ? best : "unknown";
}

export function isAnyProviderStale(entry: CtiHistoryEntry, now = Date.now()): boolean {
  for (const slot of Object.values(entry.providers) as ProviderResult[]) {
    if (slot && slot.staleAfter < now) return true;
  }
  return false;
}
