import type { DetectorMeta } from "../types";

// Three base64url segments separated by dots, with the header beginning with
// "eyJ" (the base64 of `{"`). Signature segment may be empty for unsigned
// tokens (alg=none) — accept zero-length.
const JWT_RE =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*(?=$|[^A-Za-z0-9_.-])/g;

export const jwt: DetectorMeta = {
  id: "jwt",
  label: "JWT",
  priority: 4,
  defaultConfidence: 0.9,
  placeholderPrefix: "JWT",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(JWT_RE)) {
      const start = m.index ?? 0;
      out.push({
        type: "jwt",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
