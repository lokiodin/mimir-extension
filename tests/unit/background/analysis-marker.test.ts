import { describe, expect, it } from "vitest";
import {
  ANALYSIS_OPEN_TTL_MS,
  isAnalysisMarkerFresh,
  isAnalysisOpenMarker,
} from "../../../src/modules/analysis/types";

describe("isAnalysisOpenMarker", () => {
  it("accepts a well-formed marker", () => {
    expect(
      isAnalysisOpenMarker({ entryId: "abc-123", ts: Date.now() }),
    ).toBe(true);
  });

  it("rejects null and primitives", () => {
    expect(isAnalysisOpenMarker(null)).toBe(false);
    expect(isAnalysisOpenMarker(undefined)).toBe(false);
    expect(isAnalysisOpenMarker("entry")).toBe(false);
    expect(isAnalysisOpenMarker(42)).toBe(false);
  });

  it("rejects objects missing required fields", () => {
    expect(isAnalysisOpenMarker({ entryId: "abc" })).toBe(false);
    expect(isAnalysisOpenMarker({ ts: 0 })).toBe(false);
    expect(isAnalysisOpenMarker({ entryId: 123, ts: 0 })).toBe(false);
    expect(isAnalysisOpenMarker({ entryId: "abc", ts: "now" })).toBe(false);
  });
});

describe("isAnalysisMarkerFresh", () => {
  it("treats a just-written marker as fresh", () => {
    const now = 1_000_000;
    expect(isAnalysisMarkerFresh({ entryId: "x", ts: now }, now)).toBe(true);
  });

  it("treats a marker exactly at the TTL boundary as fresh", () => {
    const now = 1_000_000;
    const ts = now - ANALYSIS_OPEN_TTL_MS;
    expect(isAnalysisMarkerFresh({ entryId: "x", ts }, now)).toBe(true);
  });

  it("treats a marker older than the TTL as stale", () => {
    const now = 1_000_000;
    const ts = now - ANALYSIS_OPEN_TTL_MS - 1;
    expect(isAnalysisMarkerFresh({ entryId: "x", ts }, now)).toBe(false);
  });

  it("uses 2 minutes as the configured TTL", () => {
    expect(ANALYSIS_OPEN_TTL_MS).toBe(2 * 60 * 1000);
  });
});
