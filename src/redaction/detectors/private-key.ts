import type { DetectorMeta } from "../types";

// Matches OpenSSH/PEM key blocks across multiple lines.
// Examples: -----BEGIN PRIVATE KEY-----, -----BEGIN RSA PRIVATE KEY-----,
//           -----BEGIN OPENSSH PRIVATE KEY-----, -----BEGIN EC PRIVATE KEY-----.
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

export const privateKey: DetectorMeta = {
  id: "private key block",
  label: "Private Key Block",
  priority: 1,
  defaultConfidence: 1.0,
  placeholderPrefix: "PRIVATE_KEY",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(PRIVATE_KEY_BLOCK)) {
      const start = m.index ?? 0;
      out.push({
        type: "private key block",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
