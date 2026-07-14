import { describe, expect, it } from "vitest";
import { mapAbuseIPDBResponse } from "../../../src/background/abuseipdb-client";

describe("mapAbuseIPDBResponse", () => {
  it("returns 'malicious' when confidence >= 75", () => {
    const { verdict, summary } = mapAbuseIPDBResponse({
      data: { abuseConfidenceScore: 80, totalReports: 12 },
    });
    expect(verdict).toBe("malicious");
    expect(summary.find((f) => f.label === "Abuse confidence")?.value).toBe(
      "80 / 100",
    );
    expect(summary.find((f) => f.label === "Total reports")?.value).toBe("12");
  });

  it("returns 'suspicious' when 25 <= confidence < 75", () => {
    expect(
      mapAbuseIPDBResponse({
        data: { abuseConfidenceScore: 30, totalReports: 4 },
      }).verdict,
    ).toBe("suspicious");
    expect(
      mapAbuseIPDBResponse({
        data: { abuseConfidenceScore: 74, totalReports: 1 },
      }).verdict,
    ).toBe("suspicious");
  });

  it("returns 'clean' when confidence < 25 and no reports", () => {
    expect(
      mapAbuseIPDBResponse({
        data: { abuseConfidenceScore: 0, totalReports: 0 },
      }).verdict,
    ).toBe("clean");
  });

  it("returns 'unknown' when confidence is low but reports exist", () => {
    expect(
      mapAbuseIPDBResponse({
        data: { abuseConfidenceScore: 5, totalReports: 2 },
      }).verdict,
    ).toBe("unknown");
  });

  it("returns 'unknown' when data is missing", () => {
    expect(mapAbuseIPDBResponse({}).verdict).toBe("unknown");
  });

  it("includes ISP, country, usage type, and last reported when present", () => {
    const { summary } = mapAbuseIPDBResponse({
      data: {
        abuseConfidenceScore: 50,
        totalReports: 5,
        countryCode: "US",
        usageType: "Data Center/Web Hosting/Transit",
        isp: "Acme Hosting",
        domain: "acme.example",
        lastReportedAt: "2024-01-15T12:34:56+00:00",
      },
    });
    expect(summary.find((f) => f.label === "Country")?.value).toBe("US");
    expect(summary.find((f) => f.label === "ISP")?.value).toBe("Acme Hosting");
    expect(summary.find((f) => f.label === "Usage type")?.value).toBe(
      "Data Center/Web Hosting/Transit",
    );
    expect(summary.find((f) => f.label === "Domain")?.value).toBe(
      "acme.example",
    );
    expect(summary.find((f) => f.label === "Last reported")?.value).toBe(
      "2024-01-15T12:34:56+00:00",
    );
  });

  it("flags whitelisted entries", () => {
    const { summary } = mapAbuseIPDBResponse({
      data: {
        abuseConfidenceScore: 0,
        totalReports: 0,
        isWhitelisted: true,
      },
    });
    expect(summary.find((f) => f.label === "Whitelisted")?.value).toBe("yes");
  });
});
