import type { DetectorMeta, DetectorHit } from "../types";

// Standard UUID with version + variant nibble bounds.
const UUID_RE =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g;

// Long opaque blob candidate — alnum plus base64-url separators. We
// deliberately exclude `=` and `_` from the class so a `KEY=value` or
// `VAR_NAME=value` env-var line breaks at the separator instead of being
// captured as one giant blob.
const OPAQUE_CANDIDATE = /\b[A-Za-z0-9+/-]{32,}\b/g;

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const len = s.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / len;
    h -= p * Math.log2(p);
  }
  return h;
}

export const uuidEntropy: DetectorMeta = {
  id: "uuid / high entropy",
  label: "UUID / High Entropy",
  priority: 12,
  defaultConfidence: 0.6,
  placeholderPrefix: "TOKEN",
  detect(text) {
    const out: DetectorHit[] = [];

    for (const m of text.matchAll(UUID_RE)) {
      const start = m.index ?? 0;
      out.push({
        type: "uuid",
        start,
        end: start + m[0].length,
        original: m[0],
        confidence: 0.95,
      });
    }

    for (const m of text.matchAll(OPAQUE_CANDIDATE)) {
      const matched = m[0];
      // Pure-numeric or pure-lower runs are usually not secrets.
      if (/^[0-9]+$/.test(matched)) continue;
      if (/^[a-z]+$/.test(matched)) continue;
      // Hex-only strings are typically public hashes (md5/sha1/sha256), not
      // secrets — skip them. The user can manually redact in Stage 3 if they
      // disagree.
      if (/^[0-9a-fA-F]+$/.test(matched)) continue;
      // Need actual mixed character classes — at least 2 of {upper, lower, digit}.
      const hasUpper = /[A-Z]/.test(matched);
      const hasLower = /[a-z]/.test(matched);
      const hasDigit = /[0-9]/.test(matched);
      const classes = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0);
      if (classes < 2) continue;
      // Entropy gate: random opaque tokens have h >= 4.0 in practice.
      if (shannonEntropy(matched) < 4.0) continue;

      const start = m.index ?? 0;
      out.push({
        type: "high entropy",
        start,
        end: start + matched.length,
        original: matched,
        confidence: 0.55,
      });
    }

    return out;
  },
};
