import { describe, it, expect } from "vitest";
import { bearerToken } from "@/redaction/detectors/bearer-token";

describe("bearer-token detector", () => {
  it("matches Authorization header form", () => {
    const text = "Authorization: Bearer abc123def456ghi789jkl0";
    const hits = bearerToken.detect(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("abc123def456ghi789jkl0");
    // Only the value is captured, not the "Bearer " prefix.
    expect(hits[0].start).toBe(text.indexOf("abc"));
  });

  it("matches a standalone Bearer prefix", () => {
    const text = "passing Bearer xyz789xyz789xyz789 to API";
    const hits = bearerToken.detect(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("xyz789xyz789xyz789");
  });

  it("does not match too-short opaque values", () => {
    expect(bearerToken.detect("Bearer short")).toHaveLength(0);
  });
});
