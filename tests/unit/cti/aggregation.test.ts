import { describe, expect, it } from "vitest";
import type {
  CtiHistoryEntry,
  ProviderResult,
  Verdict,
} from "../../../src/background/cti-types";
import { aggregateVerdict } from "../../../src/modules/cti/aggregation";

function slot(verdict: Verdict): ProviderResult {
  return {
    verdict,
    summary: [],
    response: null,
    lookedUpAt: 1,
    staleAfter: 2,
  };
}

function errorSlot(): ProviderResult {
  return {
    verdict: "error",
    summary: [],
    response: null,
    lookedUpAt: 1,
    staleAfter: 2,
    error: { kind: "lookup_failed", message: "boom" },
  };
}

function entry(
  providers: CtiHistoryEntry["providers"],
): CtiHistoryEntry {
  return {
    indicator: "1.1.1.1",
    indicatorType: "ip",
    query: "1.1.1.1",
    firstLookupAt: 1,
    lastLookupAt: 1,
    providers,
  };
}

describe("aggregateVerdict", () => {
  it("returns malicious when any provider is malicious", () => {
    expect(
      aggregateVerdict(
        entry({ virustotal: slot("clean"), abuseipdb: slot("malicious") }),
      ),
    ).toBe("malicious");
  });

  it("prefers suspicious over clean and unknown", () => {
    expect(
      aggregateVerdict(
        entry({
          virustotal: slot("clean"),
          abuseipdb: slot("suspicious"),
          abusech: slot("unknown"),
        }),
      ),
    ).toBe("suspicious");
  });

  it("ignores error slots when aggregating", () => {
    expect(
      aggregateVerdict(
        entry({ virustotal: errorSlot(), abuseipdb: slot("clean") }),
      ),
    ).toBe("clean");
  });

  it("returns unknown when every slot is an error", () => {
    expect(
      aggregateVerdict(
        entry({ virustotal: errorSlot(), abuseipdb: errorSlot() }),
      ),
    ).toBe("unknown");
  });

  it("returns unknown when there are no provider slots", () => {
    expect(aggregateVerdict(entry({}))).toBe("unknown");
  });
});
