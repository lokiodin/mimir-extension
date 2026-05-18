// Single coercion point for the Log Analysis language: persisted
// settings value, defaulting to English when unset. Used by the popup
// component (dropdown init) and the SW background runner.

import type { AnalysisLanguage, Settings } from "@/storage/types";

export function resolveAnalysisLanguage(
  settings: Settings,
): AnalysisLanguage {
  return settings.logAnalysisLanguage ?? "en";
}
