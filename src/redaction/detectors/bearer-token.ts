import type { DetectorMeta } from "../types";

// Captures the opaque value following an "Authorization: Bearer " header
// or a standalone "Bearer <opaque>" prefix. Only the value is redacted —
// the "Bearer" keyword stays in the output for readability.
const BEARER = /(?:Authorization\s*:\s*)?Bearer\s+([A-Za-z0-9._~+/=-]{8,})/gi;

export const bearerToken: DetectorMeta = {
  id: "bearer token",
  label: "Bearer Token",
  priority: 9,
  defaultConfidence: 0.85,
  placeholderPrefix: "BEARER",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(BEARER)) {
      const value = m[1];
      if (value === undefined) continue;
      // The value is always the trailing portion of the match (regex anchors
      // it at the end of `m[0]`), so the offset is deterministic.
      const valueStart = (m.index ?? 0) + m[0].length - value.length;
      out.push({
        type: "bearer token",
        start: valueStart,
        end: valueStart + value.length,
        original: value,
      });
    }
    return out;
  },
};
