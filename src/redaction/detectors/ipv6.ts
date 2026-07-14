import type { DetectorMeta } from "../types";

// Loose candidate regex: hex groups joined by `:` with optional `::` shortcut.
// Validation logic below filters false positives — pure-regex IPv6 is
// unmaintainable.
const IPV6_CANDIDATE =
  /(?<![\w:])(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(?![\w:])/g;

function isValidIpv6(raw: string): boolean {
  // At most one "::" compression marker.
  const compressionRuns = raw.match(/::+/g) ?? [];
  if (compressionRuns.length > 1) return false;
  if (compressionRuns.some((r) => r.length > 2)) return false;

  const hasCompression = raw.includes("::");
  const parts = raw.split(":");

  if (hasCompression) {
    // With compression, total parts including the empty strings around "::"
    // must be <= 9 (8 groups + boundary empties). Concretely: cleaned groups
    // (non-empty) count must be <= 7 because "::" stands in for 1+ zero
    // groups.
    const groups = parts.filter((p) => p !== "");
    if (groups.length > 7) return false;
    // Each group must be 1-4 hex chars.
    if (groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  } else {
    // No compression: must be exactly 8 hex groups.
    if (parts.length !== 8) return false;
    if (parts.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  }

  // At least one hex digit (the bare "::" case isn't useful as a redaction).
  if (!/[0-9a-fA-F]/.test(raw)) return false;

  return true;
}

export const ipv6: DetectorMeta = {
  id: "ipv6",
  label: "IPv6",
  priority: 7,
  defaultConfidence: 0.85,
  placeholderPrefix: "IP",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(IPV6_CANDIDATE)) {
      const matched = m[0];
      if (!isValidIpv6(matched)) continue;
      const start = m.index ?? 0;
      out.push({
        type: "ipv6",
        start,
        end: start + matched.length,
        original: matched,
      });
    }
    return out;
  },
};
