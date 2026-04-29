import { describe, expect, it } from "vitest";
import { mapAbusechResponse } from "../../../src/background/abusech-client";

describe("mapAbusechResponse", () => {
  it("returns 'malicious' when query_status is ok and data has hits", () => {
    const { verdict, summary } = mapAbusechResponse({
      query_status: "ok",
      data: [
        {
          ioc: "1.2.3.4",
          ioc_type: "ip:port",
          threat_type: "botnet_cc",
          malware: "win.qakbot",
          malware_printable: "Qakbot",
          confidence_level: 75,
          first_seen: "2024-01-01 00:00:00 UTC",
          last_seen: "2024-02-01 00:00:00 UTC",
        },
      ],
    });
    expect(verdict).toBe("malicious");
    expect(summary.find((f) => f.label === "Hits")?.value).toBe("1");
    expect(summary.find((f) => f.label === "Malware")?.value).toBe("Qakbot");
    expect(summary.find((f) => f.label === "Threat type")?.value).toBe(
      "botnet_cc",
    );
    expect(summary.find((f) => f.label === "Confidence")?.value).toBe(
      "75 / 100",
    );
  });

  it("returns 'clean' when query_status is no_result", () => {
    const { verdict, summary } = mapAbusechResponse({
      query_status: "no_result",
      data: [],
    });
    expect(verdict).toBe("clean");
    expect(
      summary.find((f) => f.label === "ThreatFox status")?.value,
    ).toBe("no_result");
  });

  it("returns 'unknown' for unrecognised statuses", () => {
    expect(mapAbusechResponse({ query_status: "illegal_search_term" }).verdict)
      .toBe("unknown");
    expect(mapAbusechResponse({}).verdict).toBe("unknown");
  });

  it("falls back to malware id when malware_printable is absent", () => {
    const { summary } = mapAbusechResponse({
      query_status: "ok",
      data: [{ malware: "win.emotet" }],
    });
    expect(summary.find((f) => f.label === "Malware")?.value).toBe(
      "win.emotet",
    );
  });
});
