// MV3 service worker entry point.
// Listeners must be registered synchronously at the top level
// so they survive worker restarts.

chrome.runtime.onInstalled.addListener(() => {
  // Context menu registration will go here once modules declare contextMenu entries.
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void message;
  void sender;
  void sendResponse;
  // Message routing for AI/CTI calls will be wired here.
  return false;
});
