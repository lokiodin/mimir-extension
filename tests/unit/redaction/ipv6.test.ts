import { describe, it, expect } from "vitest";
import { ipv6 } from "@/redaction/detectors/ipv6";

describe("ipv6 detector", () => {
  it("matches a fully expanded address", () => {
    const ip = "2001:0db8:0000:0000:0000:ff00:0042:8329";
    const hits = ipv6.detect(`src=${ip} dst=...`);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe(ip);
  });

  it.each([
    "2001:db8::ff00:42:8329",
    "::1",
    "fe80::1ff:fe23:4567:890a",
    "2001:db8::",
  ])("matches compressed form %s", (ip) => {
    const hits = ipv6.detect(`addr=${ip}.`);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe(ip);
  });

  it("rejects too-many-groups without compression", () => {
    expect(
      ipv6.detect("1:2:3:4:5:6:7:8:9").filter((h) => h.original.length > 4),
    ).toHaveLength(0);
  });

  it("rejects multiple :: shortcuts", () => {
    expect(ipv6.detect("2001::db8::1")).toHaveLength(0);
  });

  it("rejects groups with more than 4 hex digits", () => {
    expect(ipv6.detect("2001:db8:12345::1")).toHaveLength(0);
  });
});
