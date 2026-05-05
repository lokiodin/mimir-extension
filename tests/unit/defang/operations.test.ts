import { describe, expect, it } from "vitest";
import {
  defangAll,
  refangAll,
} from "../../../src/modules/defang/operations";

describe("defang URLs", () => {
  it("defangs https URLs (scheme + host dots)", () => {
    expect(defangAll("https://evil.com")).toBe("hxxps[://]evil[.]com");
  });

  it("defangs http URLs", () => {
    expect(defangAll("http://evil.com")).toBe("hxxp[://]evil[.]com");
  });

  it("defangs the host portion only — path and query keep literal dots", () => {
    expect(defangAll("http://10.0.0.1/path/to/file.txt?v=1.2")).toBe(
      "hxxp[://]10[.]0[.]0[.]1/path/to/file.txt?v=1.2",
    );
  });

  it("defangs multi-label hosts", () => {
    expect(defangAll("https://api.evil.co.uk/data")).toBe(
      "hxxps[://]api[.]evil[.]co[.]uk/data",
    );
  });

  it("preserves URL casing on the rest of the URL", () => {
    expect(defangAll("HTTPS://Evil.COM/Path")).toBe(
      "hxxps[://]Evil[.]COM/Path",
    );
  });
});

describe("refang URLs", () => {
  it("refangs https URLs", () => {
    expect(refangAll("hxxps[://]evil[.]com")).toBe("https://evil.com");
  });

  it("refangs http URLs", () => {
    expect(refangAll("hxxp[://]evil[.]com")).toBe("http://evil.com");
  });

  it("refangs URL with path and query, host dots only", () => {
    expect(refangAll("hxxp[://]10[.]0[.]0[.]1/path?q=1.2")).toBe(
      "http://10.0.0.1/path?q=1.2",
    );
  });
});

describe("defang IPv4", () => {
  it("defangs a single IP", () => {
    expect(defangAll("1.2.3.4")).toBe("1[.]2[.]3[.]4");
  });

  it("defangs typical RFC1918 IPs", () => {
    expect(defangAll("10.0.0.1")).toBe("10[.]0[.]0[.]1");
    expect(defangAll("192.168.1.1")).toBe("192[.]168[.]1[.]1");
    expect(defangAll("172.16.254.1")).toBe("172[.]16[.]254[.]1");
  });

  it("leaves a 5-octet sequence alone (not a valid IPv4)", () => {
    expect(defangAll("1.2.3.4.5")).toBe("1.2.3.4.5");
  });

  it("rejects octets above 255", () => {
    expect(defangAll("999.1.1.1")).toBe("999.1.1.1");
    expect(defangAll("1.999.1.1")).toBe("1.999.1.1");
    expect(defangAll("256.1.1.1")).toBe("256.1.1.1");
  });

  it("matches IP at end of sentence (trailing period stays)", () => {
    expect(defangAll("see 1.2.3.4.")).toBe("see 1[.]2[.]3[.]4.");
  });

  it("matches IP followed by comma or other punctuation", () => {
    expect(defangAll("hosts: 1.2.3.4, 5.6.7.8")).toBe(
      "hosts: 1[.]2[.]3[.]4, 5[.]6[.]7[.]8",
    );
  });
});

describe("refang IPv4", () => {
  it("refangs a single defanged IP", () => {
    expect(refangAll("1[.]2[.]3[.]4")).toBe("1.2.3.4");
  });

  it("leaves a 5-segment defanged sequence alone (not a valid IPv4)", () => {
    expect(refangAll("1[.]2[.]3[.]4[.]5")).toBe("1[.]2[.]3[.]4[.]5");
  });
});

describe("defang standalone domains", () => {
  it("defangs a two-label domain", () => {
    expect(defangAll("evil.com")).toBe("evil[.]com");
  });

  it("defangs a deep multi-label domain", () => {
    expect(defangAll("sub.evil.co.uk")).toBe("sub[.]evil[.]co[.]uk");
  });

  it("defangs domains with hyphens", () => {
    expect(defangAll("evil-c2.example.com")).toBe(
      "evil-c2[.]example[.]com",
    );
  });

  it("does not match a bare TLD-less name", () => {
    expect(defangAll("localhost")).toBe("localhost");
    expect(defangAll("server")).toBe("server");
  });
});

describe("refang standalone domains", () => {
  it("refangs a two-label domain", () => {
    expect(refangAll("evil[.]com")).toBe("evil.com");
  });

  it("refangs a deep multi-label domain", () => {
    expect(refangAll("sub[.]evil[.]co[.]uk")).toBe("sub.evil.co.uk");
  });
});

describe("defang mixed input (paragraph)", () => {
  const MIXED =
    "Saw a hit on https://evil.com from 1.2.3.4 and again at evil.com today";
  const DEFANGED =
    "Saw a hit on hxxps[://]evil[.]com from 1[.]2[.]3[.]4 and again at evil[.]com today";

  it("defangs URL, IP, and domain in a single pass", () => {
    expect(defangAll(MIXED)).toBe(DEFANGED);
  });

  it("does not defang the same dot twice", () => {
    expect(defangAll(MIXED)).not.toMatch(/\[\[\.\]\]/);
    expect(defangAll(MIXED)).not.toMatch(/\[\.\]\[\.\]/);
  });

  it("round-trips defang then refang", () => {
    expect(refangAll(defangAll(MIXED))).toBe(MIXED);
  });

  it("handles multiple URLs and IPs in one paragraph", () => {
    const input =
      "C2 https://bad.example.com:443 reached 10.0.0.1 then 172.16.5.7; pivot via http://other.example.org/api";
    const out = defangAll(input);
    expect(out).toContain("hxxps[://]bad[.]example[.]com:443");
    expect(out).toContain("10[.]0[.]0[.]1");
    expect(out).toContain("172[.]16[.]5[.]7");
    expect(out).toContain("hxxp[://]other[.]example[.]org/api");
    expect(refangAll(out)).toBe(input);
  });
});

describe("idempotence", () => {
  const MIXED =
    "Saw a hit on https://evil.com from 1.2.3.4 and again at evil.com today";

  it("defangAll is idempotent", () => {
    const once = defangAll(MIXED);
    expect(defangAll(once)).toBe(once);
  });

  it("refangAll is idempotent", () => {
    expect(refangAll(MIXED)).toBe(MIXED);
    const refanged = refangAll(defangAll(MIXED));
    expect(refangAll(refanged)).toBe(refanged);
  });

  it("never produces nested brackets", () => {
    const once = defangAll(MIXED);
    const twice = defangAll(once);
    expect(twice).not.toMatch(/\[\[/);
    expect(twice).not.toMatch(/\]\]/);
  });
});

describe("empty and no-match input", () => {
  it("empty string passes through both directions", () => {
    expect(defangAll("")).toBe("");
    expect(refangAll("")).toBe("");
  });

  it("plain prose with no IOCs passes through unchanged", () => {
    const prose = "the quick brown fox jumped over the lazy dog";
    expect(defangAll(prose)).toBe(prose);
    expect(refangAll(prose)).toBe(prose);
  });
});

