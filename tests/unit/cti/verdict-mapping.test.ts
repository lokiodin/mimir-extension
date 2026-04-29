import { describe, expect, it } from "vitest";
import { mapVirusTotalResponse } from "../../../src/background/cti-client";

describe("mapVirusTotalResponse", () => {
  it("returns 'malicious' when any engine flags malicious", () => {
    const body = {
      data: {
        attributes: {
          last_analysis_stats: {
            malicious: 5,
            suspicious: 0,
            harmless: 10,
            undetected: 60,
            timeout: 0,
          },
          reputation: -42,
        },
      },
    };
    const { verdict, summary } = mapVirusTotalResponse(body, "ip");
    expect(verdict).toBe("malicious");
    expect(summary.find((f) => f.label === "Malicious engines")?.value).toBe(
      "5 / 75",
    );
    expect(summary.find((f) => f.label === "Reputation")?.value).toBe("-42");
  });

  it("returns 'suspicious' when only suspicious hits exist", () => {
    const body = {
      data: {
        attributes: {
          last_analysis_stats: {
            malicious: 0,
            suspicious: 2,
            harmless: 0,
            undetected: 50,
          },
        },
      },
    };
    expect(mapVirusTotalResponse(body, "domain").verdict).toBe("suspicious");
  });

  it("returns 'clean' when only harmless/undetected", () => {
    const body = {
      data: {
        attributes: {
          last_analysis_stats: {
            malicious: 0,
            suspicious: 0,
            harmless: 70,
            undetected: 20,
          },
        },
      },
    };
    expect(mapVirusTotalResponse(body, "ip").verdict).toBe("clean");
  });

  it("returns 'unknown' when stats are absent", () => {
    expect(mapVirusTotalResponse({ data: { attributes: {} } }, "ip").verdict)
      .toBe("unknown");
    expect(mapVirusTotalResponse({}, "ip").verdict).toBe("unknown");
  });

  it("includes IP-specific fields when available", () => {
    const body = {
      data: {
        attributes: {
          last_analysis_stats: { harmless: 80 },
          country: "US",
          as_owner: "Google LLC",
          asn: 15169,
        },
      },
    };
    const { summary } = mapVirusTotalResponse(body, "ip");
    expect(summary.find((f) => f.label === "Country")?.value).toBe("US");
    expect(summary.find((f) => f.label === "AS owner")?.value).toBe(
      "Google LLC",
    );
    expect(summary.find((f) => f.label === "ASN")?.value).toBe("15169");
  });

  it("includes hash-specific fields when available", () => {
    const body = {
      data: {
        attributes: {
          last_analysis_stats: { malicious: 1 },
          meaningful_name: "evil.exe",
          type_description: "Win32 EXE",
        },
      },
    };
    const { summary } = mapVirusTotalResponse(body, "hash");
    expect(summary.find((f) => f.label === "Name")?.value).toBe("evil.exe");
    expect(summary.find((f) => f.label === "Type")?.value).toBe("Win32 EXE");
  });

  it("formats epoch dates as ISO strings", () => {
    const body = {
      data: {
        attributes: {
          last_analysis_stats: { harmless: 1 },
          last_analysis_date: 1_700_000_000,
        },
      },
    };
    const { summary } = mapVirusTotalResponse(body, "domain");
    const lastAnalysis = summary.find((f) => f.label === "Last analysis");
    expect(lastAnalysis?.value).toBe(new Date(1_700_000_000_000).toISOString());
  });
});
