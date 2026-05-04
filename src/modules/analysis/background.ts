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
import { getSettings } from "@/storage/manager";
import { pushAnalysisHistory } from "@/modules/analysis/history";
import type { AnalysisHistoryEntry } from "@/modules/analysis/types";
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
      return;
    }

    const result = await complete({
      type: "ai.complete",
      providerId,
      featureId: FEATURE_ID,
      userInput: selection,
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
    }
  } finally {
    decrementBadgePending();
    await refreshBadge();
  }
}
