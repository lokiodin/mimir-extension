// Service-worker context-menu lifecycle.
// - Startup (onInstalled, onStartup): removeAll then rebuild from registry +
//   settings. Idempotent across SW revivals.
// - Settings change (storage.onChanged on settings.contextMenu): incremental
//   create/remove for affected entries only — no full rebuild, no flicker.
// - Click: dispatches based on invocation.kind (popup vs background).
// See TECHNICAL_DESIGN.md §4.3.

import {
  menuCreate,
  menuRemove,
  menuRemoveAll,
  openPopup,
} from "@/browser-compat/menus";
import {
  getContextMenuEntries,
  getContextMenuEntry,
} from "@/background/context-menu-registry";
import { getSettings, storageSet, updateSettings } from "@/storage/manager";
import { refreshBadge } from "@/background/badge";
import {
  PENDING_CONTEXT_MENU_KEY,
  type ContextMenuEntry,
  type PendingContextMenu,
} from "@/registry/context-menu-types";
import type { Settings } from "@/storage/types";

function isEnabled(settings: Settings, moduleId: string): boolean {
  // PRD §7.2: enabled by default — only an explicit `false` disables.
  return settings.contextMenu[moduleId] !== false;
}

async function createEntry(entry: ContextMenuEntry): Promise<void> {
  await menuCreate({
    id: entry.moduleId,
    title: entry.title,
    contexts: [...(entry.contexts ?? ["selection"])],
  });
}

export async function rebuildContextMenus(): Promise<void> {
  await menuRemoveAll();
  const settings = await getSettings();
  const entries = getContextMenuEntries();
  for (const entry of entries) {
    if (!isEnabled(settings, entry.moduleId)) continue;
    await createEntry(entry);
  }
}

export async function syncContextMenusOnSettingsChange(
  oldSettings: Partial<Settings> | undefined,
  newSettings: Settings,
): Promise<void> {
  const oldMap = oldSettings?.contextMenu ?? {};
  const newMap = newSettings.contextMenu;
  const entries = getContextMenuEntries();
  for (const entry of entries) {
    const wasEnabled = oldMap[entry.moduleId] !== false;
    const nowEnabled = newMap[entry.moduleId] !== false;
    if (wasEnabled === nowEnabled) continue;
    if (nowEnabled) {
      await createEntry(entry);
    } else {
      await menuRemove(entry.moduleId);
    }
  }
}

export async function handleMenuClick(
  menuItemId: string,
  selection: string,
): Promise<void> {
  if (selection === "") return;
  const entry = getContextMenuEntry(menuItemId);
  if (!entry) return;
  if (entry.invocation.kind === "popup") {
    const pending: PendingContextMenu = {
      moduleId: entry.moduleId,
      selection,
      ts: Date.now(),
    };
    await storageSet(PENDING_CONTEXT_MENU_KEY, pending);
    await openPopup();
    return;
  }
  // Background mode — run without opening the popup. The runner manages its
  // own badge/history side effects.
  void entry.invocation.run(selection);
}

export async function handlePopupOpened(): Promise<void> {
  await updateSettings({ lastPopupOpenedTs: Date.now() });
  await refreshBadge();
}
