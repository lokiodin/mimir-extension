// Browser compatibility shim for Chromium/Firefox API differences.
// See TECHNICAL_DESIGN.md §3.
// Modules and shared code should use these helpers instead of calling chrome.* directly
// when a compat shim exists.

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
