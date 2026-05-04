// Popup-side dispatcher for right-click invocations.
//
// Two responsibilities:
// 1. Drain the pending context-menu handoff. When the SW handles a popup-mode
//    right-click, it writes { moduleId, selection, ts } to chrome.storage.local
//    under PENDING_CONTEXT_MENU_KEY and calls openPopup(). This hook reads the
//    key on mount AND subscribes to storage.onChanged so that popup-already-
//    open re-routes work via the same code path.
// 2. Notify the SW that the popup just opened so the unread-analysis badge is
//    cleared and the lastPopupOpenedTs cutoff is bumped.

import { useEffect } from "react";
import { useMimirStore } from "@/store";
import { storageGet, storageRemove } from "@/storage/manager";
import {
  PENDING_CONTEXT_MENU_KEY,
  type PendingContextMenu,
} from "@/registry/context-menu-types";

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

async function drainPending(): Promise<void> {
  const raw = await storageGet<unknown>(PENDING_CONTEXT_MENU_KEY);
  if (!isPendingContextMenu(raw)) return;
  await storageRemove(PENDING_CONTEXT_MENU_KEY);
  applyPending(raw);
}

export function useContextMenuDispatcher(): void {
  useEffect(() => {
    void drainPending();
    void chrome.runtime.sendMessage({ type: "popup.opened" });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== "local") return;
      const change = changes[PENDING_CONTEXT_MENU_KEY];
      if (!change) return;
      const next = change.newValue;
      if (!isPendingContextMenu(next)) return;
      void storageRemove(PENDING_CONTEXT_MENU_KEY);
      applyPending(next);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
}
