// Toolbar action badge state. SW-only.
// Rules:
//   pending > 0          -> show pending count, amber background
//   pending == 0, unread -> show unread count, blue background
//   otherwise            -> empty badge
//
// pending is in-memory (resets to 0 on SW restart — any in-flight call
// terminates with the worker, so there is nothing to recover). unread is
// derived from analysis.history vs settings.lastPopupOpenedTs each refresh,
// so it survives SW restart correctly without any persisted counter.

import { getSettings } from "@/storage/manager";
import { getAnalysisHistory } from "@/modules/analysis/history";

const COLOR_PENDING = "#d97706"; // amber-600
const COLOR_UNREAD = "#1E88E5"; // blue-600 (matches TECHNICAL_DESIGN §4.3)

let pending = 0;

export function incrementBadgePending(): void {
  pending += 1;
  void refreshBadge();
}

export function decrementBadgePending(): void {
  pending = Math.max(0, pending - 1);
  void refreshBadge();
}

async function computeUnread(): Promise<number> {
  const [settings, history] = await Promise.all([
    getSettings(),
    getAnalysisHistory(),
  ]);
  const cutoff = settings.lastPopupOpenedTs ?? 0;
  return history.filter((entry) => entry.timestamp > cutoff).length;
}

export async function refreshBadge(): Promise<void> {
  let text = "";
  let color = COLOR_PENDING;
  if (pending > 0) {
    text = String(pending);
    color = COLOR_PENDING;
  } else {
    const unread = await computeUnread();
    if (unread > 0) {
      text = String(unread);
      color = COLOR_UNREAD;
    }
  }
  await chrome.action.setBadgeText({ text });
  if (text !== "") {
    await chrome.action.setBadgeBackgroundColor({ color });
  }
}
