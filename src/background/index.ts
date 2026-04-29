// MV3 service worker entry point.
// Listeners must be registered synchronously at the top level
// so they survive worker restarts.

import { lookupVirusTotal } from "@/background/cti-client";
import { upsertCtiHistory } from "@/background/cti-history";
import { installKeepaliveListener } from "@/background/keepalive";
import { getSettings } from "@/storage/manager";
import type {
  CtiLookupRequest,
  CtiLookupResponse,
} from "@/background/cti-types";

installKeepaliveListener();

chrome.runtime.onInstalled.addListener(() => {
  // Context menu registration will go here once modules declare contextMenu entries.
});

function isCtiLookupRequest(value: unknown): value is CtiLookupRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "cti.lookup" &&
    typeof v.provider === "string" &&
    typeof v.indicatorType === "string" &&
    typeof v.indicator === "string" &&
    typeof v.query === "string"
  );
}

async function handleCtiLookup(
  req: CtiLookupRequest,
): Promise<CtiLookupResponse> {
  if (req.provider !== "virustotal") {
    return { ok: false, error: `Provider not yet supported: ${req.provider}` };
  }
  try {
    const settings = await getSettings();
    const result = await lookupVirusTotal({
      indicator: req.indicator,
      indicatorType: req.indicatorType,
      query: req.query,
      ttlHours: settings.ctiTtlHours,
    });
    await upsertCtiHistory(result);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

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

    if (isCtiLookupRequest(message)) {
      handleCtiLookup(message).then(sendResponse);
      return true; // keep the message channel open for the async response
    }

    return false;
  },
);
