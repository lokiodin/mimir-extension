// MV3 service worker entry point.
// Listeners must be registered synchronously at the top level
// so they survive worker restarts.

import { lookupVirusTotal } from "@/background/cti-client";
import { lookupAbuseIPDB } from "@/background/abuseipdb-client";
import { lookupAbusech } from "@/background/abusech-client";
import { upsertCtiHistory } from "@/background/cti-history";
import { installKeepaliveListener } from "@/background/keepalive";
import { complete as aiComplete, testConnection as aiTestConnection } from "@/background/ai-client";
import { getApiKey, getSettings } from "@/storage/manager";
import type {
  CtiLookupRequest,
  CtiLookupResponse,
  CtiResult,
} from "@/background/cti-types";
import type {
  AiCompleteRequest,
  AiTestConnectionRequest,
} from "@/background/ai-types";

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

function isAiCompleteRequest(value: unknown): value is AiCompleteRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "ai.complete" &&
    typeof v.providerId === "string" &&
    typeof v.featureId === "string" &&
    typeof v.userInput === "string"
  );
}

function isAiTestConnectionRequest(
  value: unknown,
): value is AiTestConnectionRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.type === "ai.test-connection" && typeof v.providerId === "string";
}

async function handleCtiLookup(
  req: CtiLookupRequest,
): Promise<CtiLookupResponse> {
  try {
    const settings = await getSettings();
    let result: CtiResult;
    switch (req.provider) {
      case "virustotal":
        result = await lookupVirusTotal({
          indicator: req.indicator,
          indicatorType: req.indicatorType,
          query: req.query,
          ttlHours: settings.ctiTtlHours,
        });
        break;
      case "abuseipdb":
        result = await lookupAbuseIPDB({
          indicator: req.indicator,
          indicatorType: req.indicatorType,
          query: req.query,
          ttlHours: settings.ctiTtlHours,
        });
        break;
      case "abusech": {
        const apiKey = await getApiKey("abusech");
        result = await lookupAbusech({
          indicator: req.indicator,
          indicatorType: req.indicatorType,
          query: req.query,
          ttlHours: settings.ctiTtlHours,
          mode: settings.abusechMode,
          apiKey,
        });
        break;
      }
    }
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

    if (isAiCompleteRequest(message)) {
      aiComplete(message).then(sendResponse);
      return true;
    }

    if (isAiTestConnectionRequest(message)) {
      aiTestConnection(message).then(sendResponse);
      return true;
    }

    return false;
  },
);
