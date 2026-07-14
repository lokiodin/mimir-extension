// MV3 service worker / event-page keepalive.
// See TECHNICAL_DESIGN.md §3 — workers terminate after ~30s idle, and a
// pending fetch does NOT reset the idle timer. Any extension-API call does,
// so while outbound calls are in flight we ping a trivial API every 20s.
//
// chrome.alarms is unsuitable for this: Chrome clamps `periodInMinutes` to
// a minimum of 0.5 (1.0 before Chrome 120), which fires exactly on — or
// after — the 30s idle deadline, so the worker can still be reaped between
// alarms. A plain setInterval inside the worker has no such minimum; it dies
// with the worker, but so does the in-flight call it protects.

const PING_INTERVAL_MS = 20_000;

let inFlight = 0;
let intervalId: ReturnType<typeof setInterval> | undefined;

function ping(): void {
  // Cheapest no-permission extension API call; the call itself is what
  // resets the idle timer — the result is discarded.
  void chrome.runtime.getPlatformInfo();
}

function acquireKeepalive(): void {
  inFlight += 1;
  if (inFlight === 1 && intervalId === undefined) {
    intervalId = setInterval(ping, PING_INTERVAL_MS);
  }
}

function releaseKeepalive(): void {
  inFlight -= 1;
  if (inFlight <= 0) {
    inFlight = 0;
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
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
