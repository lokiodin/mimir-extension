import type { DetectorMeta } from "../types";

// GitHub-issued tokens: ghp_ (PAT classic), gho_ (OAuth), ghu_ (user-to-server),
// ghs_ (server-to-server), ghr_ (refresh). Body is 36+ alphanumerics.
const GITHUB_TOKEN = /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g;

export const githubToken: DetectorMeta = {
  id: "github token",
  label: "GitHub Token",
  priority: 3,
  defaultConfidence: 0.95,
  placeholderPrefix: "GH_TOKEN",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(GITHUB_TOKEN)) {
      const start = m.index ?? 0;
      out.push({
        type: "github token",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
