// MV3 service worker keepalive via chrome.alarms.
// See TECHNICAL_DESIGN.md §3.
// Stub: will be wired when AI/CTI calls are implemented.

export function startKeepalive(): void {
  // Will use chrome.alarms to prevent worker termination during long requests.
}

export function stopKeepalive(): void {
  // Will clear the keepalive alarm.
}
