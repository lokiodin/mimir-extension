// MV3 background entry point.
//
// Chromium: this file is the service worker (manifest `background.service_worker`).
// Firefox: this file is loaded as a non-persistent event-page script
// (manifest `background.scripts`). Both run the same code path; the relevant
// API differences (e.g. contextMenus namespace) are hidden behind
// `src/browser-compat/`.
//
// In both environments, listeners must be registered synchronously at the
// top level so they survive worker / event-page restarts — never inside an
// async branch or behind an `await`.

import { lookupVirusTotal } from "@/background/cti-client";
import { lookupAbuseIPDB } from "@/background/abuseipdb-client";
import { lookupAbusech } from "@/background/abusech-client";
import { upsertProviderResult } from "@/background/cti-history";
import { complete as aiComplete, testConnection as aiTestConnection } from "@/background/ai-client";
import { getApiKey, getSettings } from "@/storage/manager";
import {
  handleMenuClick,
  handlePopupOpened,
  rebuildContextMenus,
  syncContextMenusOnSettingsChange,
} from "@/background/context-menus";
import { onMenuClicked } from "@/browser-compat/menus";
import { refreshBadge } from "@/background/badge";
import type { Settings } from "@/storage/types";
import type {
  CtiLookupRequest,
  CtiLookupResponse,
  CtiResult,
} from "@/background/cti-types";
import type {
  AiCompleteRequest,
  AiTestConnectionRequest,
} from "@/background/ai-types";

chrome.runtime.onInstalled.addListener(() => {
  void rebuildContextMenus();
  void refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void rebuildContextMenus();
  void refreshBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const settingsChange = changes.settings;
  if (!settingsChange) return;
  const oldVal = settingsChange.oldValue as Partial<Settings> | undefined;
  const newVal = settingsChange.newValue as Settings | undefined;
  if (!newVal) return;
  void syncContextMenusOnSettingsChange(oldVal, newVal);
});

onMenuClicked((info) => {
  const id = String(info.menuItemId);
  const selection = info.selectionText ?? "";
  void handleMenuClick(id, selection);
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
  const settings = await getSettings();
  const ttlHours = settings.ctiTtlHours;
  try {
    let result: CtiResult;
    switch (req.provider) {
      case "virustotal":
        result = await lookupVirusTotal({
          indicator: req.indicator,
          indicatorType: req.indicatorType,
          query: req.query,
          ttlHours,
        });
        break;
      case "abuseipdb":
        result = await lookupAbuseIPDB({
          indicator: req.indicator,
          indicatorType: req.indicatorType,
          query: req.query,
          ttlHours,
        });
        break;
      case "abusech": {
        const apiKey = await getApiKey("abusech");
        result = await lookupAbusech({
          indicator: req.indicator,
          indicatorType: req.indicatorType,
          query: req.query,
          ttlHours,
          mode: settings.abusechMode,
          apiKey,
        });
        break;
      }
    }
    await upsertProviderResult({
      indicator: req.indicator,
      indicatorType: req.indicatorType,
      providerId: req.provider,
      query: req.query,
      verdict: result.verdict,
      summary: result.summary,
      response: result.response,
      lookedUpAt: result.timestamp,
      staleAfter: result.staleAfter,
    });
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = Date.now();
    await upsertProviderResult({
      indicator: req.indicator,
      indicatorType: req.indicatorType,
      providerId: req.provider,
      query: req.query,
      lookedUpAt: now,
      staleAfter: now + ttlHours * 3_600_000,
      error: { kind: "lookup_failed", message },
    });
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

    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as { type: string }).type === "popup.opened"
    ) {
      handlePopupOpened().then(() => sendResponse({ ok: true }));
      return true;
    }

    return false;
  },
);
