import { describe, it, expect } from "vitest";
import { uuidEntropy } from "@/redaction/detectors/uuid-entropy";

describe("uuid/entropy detector", () => {
  it("matches a UUID v4", () => {
    const text = "id=550e8400-e29b-41d4-a716-446655440000 done";
    const hits = uuidEntropy.detect(text);
    const uuidHit = hits.find((h) => h.type === "uuid");
    expect(uuidHit).toBeDefined();
    expect(uuidHit?.original).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("flags a high-entropy mixed-case opaque blob", () => {
    const blob = "aB3xY7zQ9mNvR2sLpKj8FdGhWqEr4Tu5";
    const hits = uuidEntropy.detect(`token=${blob} body`);
    expect(hits.some((h) => h.type === "high entropy")).toBe(true);
  });

  it("does not flag pure-numeric runs", () => {
    expect(
      uuidEntropy.detect("12345678901234567890123456789012"),
    ).toHaveLength(0);
  });

  it("does not flag low-entropy short strings", () => {
    expect(uuidEntropy.detect("abc")).toHaveLength(0);
  });

  it("does not flag pure-lowercase words", () => {
    expect(
      uuidEntropy.detect(
        "thisisaverylongallunderscorenameverylonglongestlongest",
      ),
    ).toHaveLength(0);
  });
});
