// Heuristic indicator-type detection. The user can always override via the
// dropdown; this is best-effort for the "auto" path.

import type { IndicatorType } from "@/background/cti-types";

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
// Loose IPv6 — matches full and compressed forms; we don't validate exhaustively.
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const HASH_RE = /^[a-fA-F0-9]+$/;
// Domain: at least one dot, labels are alnum/hyphen, TLD has 2+ alpha chars.
const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function detectIndicatorType(raw: string): IndicatorType | null {
  const s = raw.trim();
  if (s.length === 0) return null;

  if (/^https?:\/\//i.test(s)) return "url";

  if (IPV4_RE.test(s)) return "ip";
  // IPv6 must contain a colon and be valid-ish.
  if (s.includes(":") && IPV6_RE.test(s)) return "ip";

  if (HASH_RE.test(s)) {
    if (s.length === 32 || s.length === 40 || s.length === 64) return "hash";
  }

  if (DOMAIN_RE.test(s)) return "domain";

  return null;
}
