import type { DetectorMeta } from "../types";

// Dotted-quad with per-octet bound check. Trailing constraint blocks both
// extension into a 5-octet sequence ("1.2.3.4.5") and continuation into a
// longer last octet that the regex already consumed greedily ("10.0.0.1abc"
// — the `\w` block prevents that). A trailing sentence-ending "." is fine.
const IPV4 =
  /(?<![\w.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?!\w)(?!\.\d)/g;

export const ipv4: DetectorMeta = {
  id: "ipv4",
  label: "IPv4",
  priority: 6,
  defaultConfidence: 0.95,
  placeholderPrefix: "IP",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(IPV4)) {
      const start = m.index ?? 0;
      out.push({
        type: "ipv4",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
