import { describe, it, expect } from "vitest";
import { userPath } from "@/redaction/detectors/user-path";

describe("user-path detector", () => {
  it("captures the username segment of a macOS home path", () => {
    const text = "Saved at /Users/alice/Documents/secret.txt";
    const hits = userPath.detect(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("alice");
  });

  it("captures the username segment of a Linux home path", () => {
    const text = "cd /home/bob/projects";
    const hits = userPath.detect(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("bob");
  });

  it("captures the username segment of a Windows home path", () => {
    const text = "Open C:\\Users\\carol\\Desktop";
    const hits = userPath.detect(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("carol");
  });

  it("skips well-known shared accounts", () => {
    const text = "/Users/Shared/file and /home/runner/work";
    expect(userPath.detect(text)).toHaveLength(0);
  });
});
