// MV3 service worker entry point.
// Listeners must be registered synchronously at the top level
// so they survive worker restarts.

chrome.runtime.onInstalled.addListener(() => {
  // Context menu registration will go here once modules declare contextMenu entries.
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as { type: string }).type === "open-window"
    ) {
      chrome.windows.create({
        url: chrome.runtime.getURL("window.html"),
        type: "popup",
        width: 900,
        height: 700,
      });
      sendResponse({ ok: true });
      return false;
    }
    return false;
  },
);
