import { describe, it, expect } from "vitest";
import { githubToken } from "@/redaction/detectors/github-token";

describe("github-token detector", () => {
  it("matches each GitHub token prefix", () => {
    const prefixes = ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"];
    for (const p of prefixes) {
      const tok = p + "a".repeat(36);
      const hits = githubToken.detect(`token=${tok} rest`);
      expect(hits).toHaveLength(1);
      expect(hits[0].original).toBe(tok);
    }
  });

  it("does not match a too-short body", () => {
    expect(githubToken.detect("ghp_short")).toHaveLength(0);
  });

  it("does not match an unrelated prefix", () => {
    expect(githubToken.detect("ghx_" + "a".repeat(36))).toHaveLength(0);
  });
});
