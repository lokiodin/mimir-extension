import type { DetectorMeta } from "../types";

// Access keys: 4-char prefix from the AWS prefix list + 16 base32 chars.
// Most common in the wild are AKIA (long-term IAM) and ASIA (STS short-term).
const AWS_ACCESS_KEY = /\b((?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[0-9A-Z]{16})\b/g;

export const awsKey: DetectorMeta = {
  id: "aws access key",
  label: "AWS Access Key",
  priority: 2,
  defaultConfidence: 0.95,
  placeholderPrefix: "AWS_KEY",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(AWS_ACCESS_KEY)) {
      const start = m.index ?? 0;
      out.push({
        type: "aws access key",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
