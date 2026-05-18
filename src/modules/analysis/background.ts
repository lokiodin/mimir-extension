// SW-side background runner for the Log Analysis right-click action.
// Per PRD §3.5 + Tech Design §4.3, Log Analysis runs without opening the popup
// so the user can keep working while the AI call is in flight. Result lands in
// analysis.history; the toolbar badge surfaces pending and unread counts.

import { complete } from "@/background/ai-client";
import {
  decrementBadgePending,
  incrementBadgePending,
  refreshBadge,
} from "@/background/badge";
import { isAnyMimirSurfaceOpen } from "@/background/surface-state";
import { openPopup } from "@/browser-compat/menus";
import { getSettings, storageSet } from "@/storage/manager";
import { pushAnalysisHistory } from "@/modules/analysis/history";
import { resolveAnalysisLanguage } from "@/modules/analysis/language";
import {
  ANALYSIS_OPEN_ON_NEXT_POPUP_KEY,
  type AnalysisHistoryEntry,
  type AnalysisOpenOnNextPopup,
} from "@/modules/analysis/types";
import type { AiProviderConfig } from "@/storage/types";

const FEATURE_ID = "log-analysis";

function pickProviderId(
  providers: AiProviderConfig[],
  preferredId: string | undefined,
): string | undefined {
  if (preferredId && providers.some((p) => p.id === preferredId)) {
    return preferredId;
  }
  return providers[0]?.id;
}

// Best-effort auto-open of the popup when a background analysis completes
// with no Mimir surface currently rendered. The marker survives popup-open
// failure (TTL'd) so the next manual popup open routes to the entry. See
// PRD §7.4 (F-LOG-7) and TECHNICAL_DESIGN.md §4.3.
async function maybeAutoOpenForBackground(entryId: string): Promise<void> {
  if (await isAnyMimirSurfaceOpen()) return;
  const marker: AnalysisOpenOnNextPopup = { entryId, ts: Date.now() };
  await storageSet(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY, marker);
  await openPopup();
}

export async function runAnalysisInBackground(
  selection: string,
): Promise<void> {
  if (selection.trim() === "") return;
  incrementBadgePending();
  try {
    const settings = await getSettings();
    const providerId = pickProviderId(
      settings.aiProviders,
      settings.defaultAiProviderId,
    );

    if (!providerId) {
      const entry: AnalysisHistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        input: selection,
        response: "No AI provider configured. Open Settings → AI Providers to add one.",
        providerLabel: "(no provider)",
        providerType: "ollama",
        error: true,
      };
      await pushAnalysisHistory(entry);
      await maybeAutoOpenForBackground(entry.id);
      return;
    }

    const result = await complete({
      type: "ai.complete",
      providerId,
      featureId: FEATURE_ID,
      userInput: selection,
      language: resolveAnalysisLanguage(settings),
    });

    const provider = settings.aiProviders.find((p) => p.id === providerId);
    if (result.ok) {
      const entry: AnalysisHistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        input: selection,
        response: result.response,
        providerLabel: result.providerLabel,
        providerType: result.providerType,
      };
      await pushAnalysisHistory(entry);
      await maybeAutoOpenForBackground(entry.id);
    } else {
      const entry: AnalysisHistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        input: selection,
        response: result.error,
        providerLabel: provider?.label ?? "(unknown)",
        providerType: provider?.type ?? "ollama",
        error: true,
      };
      await pushAnalysisHistory(entry);
      await maybeAutoOpenForBackground(entry.id);
    }
  } finally {
    decrementBadgePending();
    await refreshBadge();
  }
}
