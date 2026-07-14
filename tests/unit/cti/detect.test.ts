import { describe, expect, it } from "vitest";
import { detectIndicatorType } from "../../../src/modules/cti/detect";

describe("detectIndicatorType", () => {
  it("detects IPv4", () => {
    expect(detectIndicatorType("8.8.8.8")).toBe("ip");
    expect(detectIndicatorType("192.168.1.1")).toBe("ip");
    expect(detectIndicatorType("0.0.0.0")).toBe("ip");
  });

  it("detects IPv6", () => {
    expect(detectIndicatorType("2001:db8::1")).toBe("ip");
    expect(detectIndicatorType("::1")).toBe("ip");
    expect(detectIndicatorType("fe80::1")).toBe("ip");
  });

  it("rejects an out-of-range IPv4 octet", () => {
    expect(detectIndicatorType("999.0.0.1")).toBe(null);
  });

  it("detects URLs by scheme", () => {
    expect(detectIndicatorType("http://evil.com/path")).toBe("url");
    expect(detectIndicatorType("https://api.evil.co.uk/data?q=1")).toBe("url");
    expect(detectIndicatorType("HTTPS://Evil.COM")).toBe("url");
  });

  it("detects file hashes by length", () => {
    // MD5
    expect(detectIndicatorType("d41d8cd98f00b204e9800998ecf8427e")).toBe(
      "hash",
    );
    // SHA1
    expect(
      detectIndicatorType("da39a3ee5e6b4b0d3255bfef95601890afd80709"),
    ).toBe("hash");
    // SHA256
    expect(
      detectIndicatorType(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      ),
    ).toBe("hash");
  });

  it("rejects hex strings of non-hash lengths", () => {
    expect(detectIndicatorType("abc123")).toBe(null);
  });

  it("detects domains", () => {
    expect(detectIndicatorType("evil.com")).toBe("domain");
    expect(detectIndicatorType("api.evil.co.uk")).toBe("domain");
    expect(detectIndicatorType("sub.example-test.org")).toBe("domain");
  });

  it("returns null for empty / unrecognized input", () => {
    expect(detectIndicatorType("")).toBe(null);
    expect(detectIndicatorType("   ")).toBe(null);
    expect(detectIndicatorType("not an indicator")).toBe(null);
    expect(detectIndicatorType("evil")).toBe(null); // no TLD
  });

  it("trims surrounding whitespace", () => {
    expect(detectIndicatorType("  8.8.8.8  ")).toBe("ip");
    expect(detectIndicatorType("\tevil.com\n")).toBe("domain");
  });
});
