// Cross-browser context-menu / action.openPopup shim.
// Chromium uses chrome.contextMenus.* (callback-based with chrome.runtime.lastError).
// Firefox uses browser.menus.* (the modern, non-deprecated namespace).
// See TECHNICAL_DESIGN.md §4.3.

import { isFirefox } from "@/browser-compat";

type MenuCreateProperties = chrome.contextMenus.CreateProperties;
type OnClickData = chrome.contextMenus.OnClickData;

interface MenuApi {
  create: (
    props: MenuCreateProperties,
    callback?: () => void,
  ) => string | number;
  remove: (id: string | number, callback?: () => void) => void;
  removeAll: (callback?: () => void) => void;
  onClicked: chrome.contextMenus.MenuClickedEvent;
}

function getMenuApi(): MenuApi {
  if (isFirefox()) {
    const browser = (globalThis as { browser?: { menus?: MenuApi } }).browser;
    if (browser?.menus) return browser.menus;
  }
  return chrome.contextMenus as unknown as MenuApi;
}

// Touch lastError so Chromium does not log "unchecked runtime.lastError"
// warnings when callers don't care about per-call success (the shim is built
// to be idempotent — duplicate-id and not-found errors are expected and ignored).
function consumeLastError(): void {
  void chrome.runtime.lastError;
}

export function menuCreate(props: MenuCreateProperties): Promise<void> {
  return new Promise((resolve) => {
    try {
      getMenuApi().create(props, () => {
        consumeLastError();
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

export function menuRemove(id: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      getMenuApi().remove(id, () => {
        consumeLastError();
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

export function menuRemoveAll(): Promise<void> {
  return new Promise((resolve) => {
    try {
      getMenuApi().removeAll(() => {
        consumeLastError();
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

export function onMenuClicked(
  listener: (info: OnClickData) => void,
): void {
  getMenuApi().onClicked.addListener(listener);
}

// chrome.action.openPopup() is supported on Chromium 127+ (from a service-worker
// user-gesture context) and Firefox 109+. Failures (older versions, focus blocked
// by DevTools or full-screen video, no active normal window) are non-fatal —
// the popup-side dispatcher's storage.onChanged listener handles delivery if
// the popup is already open or opened later.
export async function openPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch {
    // intentionally swallowed — see comment above
  }
}
