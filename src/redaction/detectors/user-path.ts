import type { DetectorMeta } from "../types";

// Username segment of a home-directory path. The "/Users/" or "/home/" or
// "C:\Users\" prefix is preserved — only the username itself is redacted.
// Captured group: the username segment up to the next path separator.
const USER_PATH =
  /(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)([A-Za-z0-9_.][A-Za-z0-9_.-]{0,31})(?=[\\/]|$|\s)/g;

export const userPath: DetectorMeta = {
  id: "user path",
  label: "User Path",
  priority: 10,
  defaultConfidence: 0.85,
  placeholderPrefix: "USER",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(USER_PATH)) {
      const prefix = m[1];
      const name = m[2];
      if (prefix === undefined || name === undefined) continue;
      // Skip a few well-known non-identifying segments that show up in the
      // wild (e.g. "/Users/Shared/" on macOS, "/home/runner/" in CI logs).
      if (
        name === "Shared" ||
        name === "Public" ||
        name === "Default" ||
        name === "runner" ||
        name === "ubuntu" ||
        name === "ec2-user"
      )
        continue;
      const start = (m.index ?? 0) + prefix.length;
      out.push({
        type: "user path",
        start,
        end: start + name.length,
        original: name,
      });
    }
    return out;
  },
};
