import type { DetectorMeta } from "../types";

// RFC-5322 subset: tolerant of common real-world local parts (alnum, dot,
// underscore, plus, hyphen) and a domain with at least one dot and a 2+
// letter TLD. Avoids matching trailing punctuation by requiring an alnum
// terminal.
const EMAIL =
  /\b[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}\b/g;

export const email: DetectorMeta = {
  id: "email",
  label: "Email",
  priority: 5,
  defaultConfidence: 0.9,
  placeholderPrefix: "EMAIL",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(EMAIL)) {
      const start = m.index ?? 0;
      out.push({
        type: "email",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
