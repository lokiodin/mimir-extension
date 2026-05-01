import type { DetectorMeta } from "../types";

// Six pairs of hex octets joined by ':' or '-'. Word-boundary anchors keep
// this from matching arbitrary hex soup.
const MAC = /\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/g;

export const mac: DetectorMeta = {
  id: "mac address",
  label: "MAC Address",
  priority: 8,
  defaultConfidence: 0.9,
  placeholderPrefix: "MAC",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(MAC)) {
      const start = m.index ?? 0;
      out.push({
        type: "mac address",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
