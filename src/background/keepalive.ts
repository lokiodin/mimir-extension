// MV3 service worker keepalive via chrome.alarms.
// See TECHNICAL_DESIGN.md §3 — workers terminate after ~30s idle, so during
// in-flight outbound calls we hold a periodic alarm to prevent termination.

const ALARM_NAME = "mimir-keepalive";
// Period must be < 30s to keep the worker alive across idle gaps.
// 0.4 minutes ≈ 24 seconds.
const KEEPALIVE_PERIOD_MINUTES = 0.4;

let inFlight = 0;
let listenerInstalled = false;

export function installKeepaliveListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  // The listener body is intentionally empty — having any registered listener
  // is what wakes the worker when the alarm fires.
  chrome.alarms.onAlarm.addListener(() => {});
}

function startAlarm(): void {
  void chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: KEEPALIVE_PERIOD_MINUTES,
  });
}

function stopAlarm(): void {
  void chrome.alarms.clear(ALARM_NAME);
}

function acquireKeepalive(): void {
  inFlight += 1;
  if (inFlight === 1) startAlarm();
}

function releaseKeepalive(): void {
  inFlight -= 1;
  if (inFlight <= 0) {
    inFlight = 0;
    stopAlarm();
  }
}

export async function withKeepalive<T>(fn: () => Promise<T>): Promise<T> {
  acquireKeepalive();
  try {
    return await fn();
  } finally {
    releaseKeepalive();
  }
}
