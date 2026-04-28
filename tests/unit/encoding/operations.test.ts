import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  hexDecode,
  hexEncode,
  htmlDecode,
  htmlEncode,
  jwtDecode,
  OPERATIONS,
  urlDecode,
  urlEncode,
} from "../../../src/modules/encoding/operations";

describe("base64", () => {
  it("encodes and decodes ASCII round-trip", () => {
    expect(base64Decode(base64Encode("hello"))).toBe("hello");
  });

  it("encodes and decodes UTF-8 round-trip (accented)", () => {
    expect(base64Decode(base64Encode("café"))).toBe("café");
  });

  it("encodes and decodes UTF-8 round-trip (CJK)", () => {
    expect(base64Decode(base64Encode("日本語"))).toBe("日本語");
  });

  it("encodes and decodes emoji round-trip", () => {
    expect(base64Decode(base64Encode("🔐"))).toBe("🔐");
  });

  it("encodes and decodes empty string", () => {
    expect(base64Encode("")).toBe("");
    expect(base64Decode("")).toBe("");
  });

  it("decodes a known fixture", () => {
    expect(base64Decode("aGVsbG8=")).toBe("hello");
  });

  it("rejects invalid characters", () => {
    expect(() => base64Decode("!!!")).toThrow(/Invalid Base64/);
  });

  it("rejects bad length (length mod 4 == 1)", () => {
    expect(() => base64Decode("a")).toThrow(/Invalid Base64/);
  });

  it("encode output contains no whitespace", () => {
    expect(base64Encode("a longer string with spaces and stuff")).not.toMatch(
      /\s/,
    );
  });
});

describe("hex", () => {
  it("encodes and decodes ASCII round-trip", () => {
    expect(hexDecode(hexEncode("hello"))).toBe("hello");
  });

  it("encodes and decodes UTF-8 round-trip", () => {
    expect(hexDecode(hexEncode("café 日本語 🔐"))).toBe("café 日本語 🔐");
  });

  it("encodes and decodes empty string", () => {
    expect(hexEncode("")).toBe("");
    expect(hexDecode("")).toBe("");
  });

  it("decode accepts uppercase", () => {
    expect(hexDecode("48656C6C6F")).toBe("Hello");
  });

  it("decode accepts lowercase", () => {
    expect(hexDecode("68656c6c6f")).toBe("hello");
  });

  it("decode accepts mixed case", () => {
    expect(hexDecode("48656c6C6F")).toBe("Hello");
  });

  it("decode strips leading 0x", () => {
    expect(hexDecode("0x68656c6c6f")).toBe("hello");
    expect(hexDecode("0X68656c6c6f")).toBe("hello");
  });

  it("decode strips ASCII whitespace", () => {
    expect(hexDecode("68 65 6c 6c 6f")).toBe("hello");
    expect(hexDecode("68\t65\n6c 6c\r6f")).toBe("hello");
  });

  it("decode rejects odd length", () => {
    expect(() => hexDecode("abc")).toThrow(/length must be even/);
  });

  it("decode rejects non-hex characters", () => {
    expect(() => hexDecode("zz")).toThrow(/non-hex/);
  });

  it("encode emits lowercase", () => {
    expect(hexEncode("Hi!")).toBe("486921");
  });
});

describe("url", () => {
  it("encodes and decodes round-trip with spaces", () => {
    expect(urlDecode(urlEncode("hello world"))).toBe("hello world");
  });

  it("encodes and decodes round-trip with reserved chars", () => {
    expect(urlDecode(urlEncode("a&b=c?d#e/f"))).toBe("a&b=c?d#e/f");
  });

  it("encodes and decodes UTF-8 round-trip", () => {
    expect(urlDecode(urlEncode("café 日本語 🔐"))).toBe("café 日本語 🔐");
  });

  it("encodes and decodes empty string", () => {
    expect(urlEncode("")).toBe("");
    expect(urlDecode("")).toBe("");
  });

  it("decode rejects malformed input (bad escape)", () => {
    expect(() => urlDecode("%ZZ")).toThrow(/Invalid URL encoding/);
  });

  it("decode rejects malformed input (truncated UTF-8 escape)", () => {
    expect(() => urlDecode("%E0%A4")).toThrow(/Invalid URL encoding/);
  });
});

describe("html", () => {
  it("encodes the five standard chars", () => {
    expect(htmlEncode("&")).toBe("&amp;");
    expect(htmlEncode("<")).toBe("&lt;");
    expect(htmlEncode(">")).toBe("&gt;");
    expect(htmlEncode('"')).toBe("&quot;");
    expect(htmlEncode("'")).toBe("&apos;");
  });

  it("encode order does not double-encode the ampersand", () => {
    expect(htmlEncode("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });

  it("encode leaves UTF-8 and ASCII letters unchanged", () => {
    expect(htmlEncode("café 日本語 🔐")).toBe("café 日本語 🔐");
    expect(htmlEncode("hello123")).toBe("hello123");
  });

  it("decodes named entities", () => {
    expect(htmlDecode("&amp;&lt;&gt;&quot;&apos;&nbsp;")).toBe("&<>\"' ");
  });

  it("decodes numeric decimal entities", () => {
    expect(htmlDecode("&#65;")).toBe("A");
    expect(htmlDecode("&#128274;")).toBe("🔒");
  });

  it("decodes numeric hex entities", () => {
    expect(htmlDecode("&#x41;")).toBe("A");
    expect(htmlDecode("&#x1F512;")).toBe("🔒");
  });

  it("decodes surrogate-pair hex entities", () => {
    expect(htmlDecode("&#xD83D;&#xDD12;")).toBe("🔒");
  });

  it("round-trips the five standard chars", () => {
    const original = `& < > " '`;
    expect(htmlDecode(htmlEncode(original))).toBe(original);
  });

  it("leaves unknown entities untouched", () => {
    expect(htmlDecode("&unknown;")).toBe("&unknown;");
    expect(htmlDecode("hello &foo; world")).toBe("hello &foo; world");
  });

  it("encodes and decodes empty string", () => {
    expect(htmlEncode("")).toBe("");
    expect(htmlDecode("")).toBe("");
  });
});

describe("jwt", () => {
  // Fixture from jwt.io default sample (HS256 header + classic payload).
  const VALID_TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
    ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  it("decodes a valid 3-part token", () => {
    const out = jwtDecode(VALID_TOKEN);
    expect(out).toContain('"alg": "HS256"');
    expect(out).toContain('"typ": "JWT"');
    expect(out).toContain('"sub": "1234567890"');
    expect(out).toContain('"name": "John Doe"');
    expect(out).toContain('"iat": 1516239022');
  });

  it("separates header and payload with a blank line", () => {
    const out = jwtDecode(VALID_TOKEN);
    expect(out).toMatch(/}\n\n{/);
  });

  it("rejects 2-part token", () => {
    expect(() => jwtDecode("a.b")).toThrow(/3 parts \(got 2\)/);
  });

  it("rejects 4-part token", () => {
    expect(() => jwtDecode("a.b.c.d")).toThrow(/3 parts \(got 4\)/);
  });

  it("rejects empty input", () => {
    expect(() => jwtDecode("")).toThrow(/3 parts \(got 1\)/);
  });

  it("rejects header that is not valid JSON", () => {
    // 'not-json' base64url-encoded is "bm90LWpzb24"
    expect(() => jwtDecode("bm90LWpzb24.bm90LWpzb24.x")).toThrow(
      /header is not valid JSON/,
    );
  });

  it("rejects payload that is not valid JSON when header is valid", () => {
    // header {} → "e30"; payload "not-json" → "bm90LWpzb24"
    expect(() => jwtDecode("e30.bm90LWpzb24.x")).toThrow(
      /payload is not valid JSON/,
    );
  });

  it("ignores the signature segment (no verification)", () => {
    const tampered = VALID_TOKEN.replace(/\.[^.]+$/, ".this-is-not-a-signature");
    expect(() => jwtDecode(tampered)).not.toThrow();
    expect(jwtDecode(tampered)).toContain('"sub": "1234567890"');
  });

  it("decodes base64url with - and _ chars and missing padding", () => {
    // {"a":">>>"} → JSON: {"a":">>>"} → base64: eyJhIjoiPj4+In0= → base64url
    // We construct manually: header = {"alg":"none"}, payload = {"a":">>>"}
    // header standard base64 = eyJhbGciOiJub25lIn0= → base64url (drop pad) = eyJhbGciOiJub25lIn0
    // payload standard base64 = eyJhIjoiPj4+In0= → base64url = eyJhIjoiPj4-In0
    // (replace + with -, strip = padding)
    const token = "eyJhbGciOiJub25lIn0.eyJhIjoiPj4-In0.sig";
    const out = jwtDecode(token);
    expect(out).toContain('"alg": "none"');
    expect(out).toContain('"a": ">>>"');
  });
});

describe("OPERATIONS registry", () => {
  it("lists all nine operations", () => {
    const ids = OPERATIONS.map((o) => o.id);
    expect(ids).toEqual([
      "base64-encode",
      "base64-decode",
      "hex-encode",
      "hex-decode",
      "url-encode",
      "url-decode",
      "html-encode",
      "html-decode",
      "jwt-decode",
    ]);
  });

  it("groups every operation under one of the five known groups", () => {
    const groups = new Set(OPERATIONS.map((o) => o.group));
    expect(groups).toEqual(new Set(["Base64", "Hex", "URL", "HTML", "JWT"]));
  });
});
