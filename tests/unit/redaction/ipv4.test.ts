import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ipv4 } from "@/redaction/detectors/ipv4";

describe("ipv4 detector", () => {
  it.each([
    "10.0.0.1",
    "192.168.1.255",
    "8.8.8.8",
    "172.16.254.1",
    "0.0.0.0",
    "255.255.255.255",
  ])("matches %s", (ip) => {
    const hits = ipv4.detect(`source=${ip} something`);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe(ip);
  });

  it("rejects octets above 255", () => {
    expect(ipv4.detect("999.1.2.3")).toHaveLength(0);
    expect(ipv4.detect("256.1.2.3")).toHaveLength(0);
  });

  it("does not match the first three octets of a longer dotted run", () => {
    expect(ipv4.detect("1.2.3.4.5")).toHaveLength(0);
  });

  it("does not match version strings", () => {
    expect(ipv4.detect("v1.2.3.4")).toHaveLength(0);
  });

  it("property: any valid octet quad is detected exactly", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
        ),
        ([a, b, c, d]) => {
          const ip = `${a}.${b}.${c}.${d}`;
          const hits = ipv4.detect(`see ${ip} now`);
          return hits.length === 1 && hits[0].original === ip;
        },
      ),
    );
  });
});
