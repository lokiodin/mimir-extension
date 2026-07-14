// Popup-side dispatcher for right-click invocations and background-completion
// auto-open routing.
//
// Three responsibilities:
// 1. Drain the pending context-menu handoff. When the SW handles a popup-mode
//    right-click, it writes { moduleId, selection, ts } to chrome.storage.local
//    under PENDING_CONTEXT_MENU_KEY and calls openPopup(). This hook reads the
//    key on mount AND subscribes to storage.onChanged so that popup-already-
//    open re-routes work via the same code path.
// 2. Drain the analysis auto-open marker. When a background analysis completes
//    with no Mimir surface open, the runner writes ANALYSIS_OPEN_ON_NEXT_POPUP_KEY
//    and calls openPopup(). The drain switches to Log Analysis and stages the
//    entry id in the pendingAnalysisOpen slot, which the module consumes.
//    TTL'd to avoid stale routing on later popup opens.
// 3. Notify the SW that the popup just opened so the unread-analysis badge is
//    cleared and the lastPopupOpenedTs cutoff is bumped.

import { useEffect } from "react";
import { useMimirStore } from "@/store";
import { storageGet, storageRemove } from "@/storage/manager";
import {
  PENDING_CONTEXT_MENU_KEY,
  type PendingContextMenu,
} from "@/registry/context-menu-types";
import {
  ANALYSIS_OPEN_ON_NEXT_POPUP_KEY,
  isAnalysisMarkerFresh,
  isAnalysisOpenMarker,
  type AnalysisOpenOnNextPopup,
} from "@/modules/analysis/types";

const PENDING_TTL_MS = 10_000;

function isPendingContextMenu(value: unknown): value is PendingContextMenu {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.moduleId === "string" &&
    typeof v.selection === "string" &&
    typeof v.ts === "number"
  );
}

function applyPending(pending: PendingContextMenu): void {
  if (Date.now() - pending.ts > PENDING_TTL_MS) return;
  const store = useMimirStore.getState();
  store.setActiveModuleId(pending.moduleId);
  store.setPendingInput({
    moduleId: pending.moduleId,
    value: pending.selection,
  });
}

function applyAnalysisOpen(marker: AnalysisOpenOnNextPopup): void {
  if (!isAnalysisMarkerFresh(marker)) return;
  const store = useMimirStore.getState();
  store.setActiveModuleId("log-analysis");
  store.setPendingAnalysisOpen({ entryId: marker.entryId });
}

async function drainPending(): Promise<void> {
  const raw = await storageGet<unknown>(PENDING_CONTEXT_MENU_KEY);
  if (!isPendingContextMenu(raw)) return;
  await storageRemove(PENDING_CONTEXT_MENU_KEY);
  applyPending(raw);
}

async function drainAnalysisOpen(): Promise<void> {
  const raw = await storageGet<unknown>(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY);
  // Always clear — expired markers shouldn't linger and the slot is single-shot.
  await storageRemove(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY);
  if (!isAnalysisOpenMarker(raw)) return;
  applyAnalysisOpen(raw);
}

export function useContextMenuDispatcher(): void {
  useEffect(() => {
    void drainPending();
    void drainAnalysisOpen();
    void chrome.runtime.sendMessage({ type: "popup.opened" });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== "local") return;
      const pendingChange = changes[PENDING_CONTEXT_MENU_KEY];
      if (pendingChange) {
        const next = pendingChange.newValue;
        if (isPendingContextMenu(next)) {
          void storageRemove(PENDING_CONTEXT_MENU_KEY);
          applyPending(next);
        }
      }
      const analysisChange = changes[ANALYSIS_OPEN_ON_NEXT_POPUP_KEY];
      if (analysisChange) {
        const next = analysisChange.newValue;
        if (isAnalysisOpenMarker(next)) {
          void storageRemove(ANALYSIS_OPEN_ON_NEXT_POPUP_KEY);
          applyAnalysisOpen(next);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
}
