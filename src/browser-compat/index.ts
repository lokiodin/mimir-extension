// Browser compatibility shim for Chromium/Firefox API differences.
// See TECHNICAL_DESIGN.md §3.
// Modules and shared code should use these helpers instead of calling chrome.* directly
// when a compat shim exists.
//
// ----------------------------------------------------------------------------
// Divergences encountered & how they're handled
// ----------------------------------------------------------------------------
//
// 1. Context-menu namespace.
//    Chromium exposes chrome.contextMenus.* (callback API).
//    Firefox exposes browser.menus.* (Promise API; browser.contextMenus is a
//    deprecated alias we intentionally don't use).
//    Handled by ./menus.ts — getMenuApi() picks the right one and the wrappers
//    normalise to a Promise-returning, error-swallowing API so callers stay
//    naive about duplicate-id / not-found errors.
//
// 2. chrome.action.openPopup() availability & gating.
//    Both browsers support it (Chromium 127+, Firefox 109+) when called from a
//    context-menu user gesture. It rejects on older versions, when DevTools is
//    focused, in full-screen video, or when no normal window is active.
//    Handled by ./menus.ts → openPopup(): swallowed failures are non-fatal
//    because the popup-side dispatcher's storage.onChanged listener delivers
//    the pending handoff whenever the popup eventually opens.
//
// 3. Background context model.
//    Chromium MV3: service_worker (true SW; terminates after ~30s idle).
//    Firefox MV3:  background.scripts (event page; also terminates ~30s idle).
//    Handled at the manifest level (manifest.chromium.json vs
//    manifest.firefox.json). All listeners in src/background/index.ts are
//    registered synchronously at top level so they survive both lifecycle
//    models. The setInterval keepalive (src/background/keepalive.ts) works
//    on both — the periodic chrome.runtime.getPlatformInfo() call resets the
//    idle timer of Firefox event pages the same way it does Chromium SWs.
//
// 4. permissions.request() user-gesture rule.
//    Firefox rejects the call outside a user-gesture handler (button click,
//    keyboard activation). Chromium tolerates it from blur/change handlers.
//    Not shimmable — the missing gesture is genuine. Handled by UX: settings
//    triggers the request only from explicit user-gesture buttons (the inline
//    "Grant access" button and the "Test" button in src/modules/settings/
//    component.tsx). Never from blur, change, or save.
//
// 5. windows.create({ type: "popup" }) styling.
//    Both browsers honour the call but Firefox renders the result with more
//    chrome (URL bar, etc.) than Chromium. Cosmetic; not shimmed. The
//    standalone-window surface still works.
//
// 6. storage.onChanged event timing.
//    Firefox fires the event synchronously in the writer's context; Chromium
//    fires it asynchronously. All listeners in this codebase are idempotent
//    (revision-counter bumps, key-presence read-then-remove, settings-diff
//    checks), so the timing difference doesn't change observed behavior.
//    Documented here in case a future feature introduces a sync-vs-async
//    sensitive listener — it would need to live behind a shim.
//
// ----------------------------------------------------------------------------
// Things that LOOK like divergences but aren't (don't shim these)
// ----------------------------------------------------------------------------
//
// - chrome.runtime.sendMessage / onMessage, chrome.storage.local.get/set/remove,
//   chrome.action.setBadgeText / setBadgeBackgroundColor,
//   chrome.permissions.contains, chrome.runtime.getURL — Firefox 109+ exposes
//   chrome.* as a Promise-returning alias for browser.*, so these all work
//   identically across both targets. Don't add wrapper helpers "just in case."

export function isFirefox(): boolean {
  return typeof (globalThis as Record<string, unknown>).browser !== "undefined";
}

export {
  menuCreate,
  menuRemove,
  menuRemoveAll,
  onMenuClicked,
  openPopup,
} from "@/browser-compat/menus";
