import { describe, it, expect } from "vitest";
import { fqdn } from "@/redaction/detectors/fqdn";

describe("fqdn detector", () => {
  it.each([
    "evil.example.com",
    "api.service.io",
    "internal.tools.dev",
    "research.security.gov",
  ])("matches %s", (host) => {
    const hits = fqdn.detect(`Visited ${host} earlier.`);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe(host);
  });

  it("does not match version strings", () => {
    expect(fqdn.detect("library 1.2.3.release")).toHaveLength(0);
  });

  it("does not match unknown TLDs", () => {
    expect(fqdn.detect("foo.bar")).toHaveLength(0);
    expect(fqdn.detect("widget.gizmo")).toHaveLength(0);
  });

  it("does not match the email-domain part (left for the Stage 1 overlap step)", () => {
    // The detector itself will match — but Stage 1's overlap resolution
    // drops it because email runs first. Here we confirm the detector
    // would fire.
    const hits = fqdn.detect("foo@host.example.com is mine");
    expect(hits.some((h) => h.original === "host.example.com")).toBe(true);
  });
});
