import type { AiProviderConfig } from "@/storage/types";

export interface AnalysisHistoryEntry {
  id: string;
  timestamp: number;
  input: string;
  response: string;
  providerLabel: string;
  providerType: AiProviderConfig["type"];
  // True when the entry is a failed analysis. `response` then carries the
  // error message and the history pane renders it distinctly.
  error?: boolean;
}

// Single-slot marker written by the background runner when an analysis
// completes with no Mimir surface open. The popup's dispatcher drains this on
// mount (and via storage.onChanged) to route directly to the entry.
// TTL'd to avoid stale routing on unrelated popup opens later in the session.
export const ANALYSIS_OPEN_ON_NEXT_POPUP_KEY =
  "modules.analysis.openOnNextPopup";
export const ANALYSIS_OPEN_TTL_MS = 2 * 60 * 1000;

export interface AnalysisOpenOnNextPopup {
  entryId: string;
  ts: number;
}

export function isAnalysisOpenMarker(
  value: unknown,
): value is AnalysisOpenOnNextPopup {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.entryId === "string" && typeof v.ts === "number";
}

export function isAnalysisMarkerFresh(
  marker: AnalysisOpenOnNextPopup,
  now: number = Date.now(),
): boolean {
  return now - marker.ts <= ANALYSIS_OPEN_TTL_MS;
}
