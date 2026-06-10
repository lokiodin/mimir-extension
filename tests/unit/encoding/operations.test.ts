import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  base32Decode,
  base32Encode,
  base64Decode,
  base64Encode,
  decimalDecode,
  decimalEncode,
  hexDecode,
  hexEncode,
  htmlDecode,
  htmlEncode,
  jwtDecode,
  jwtDecodeParts,
  jwtEncodeParts,
  jwtHmacResign,
  jwtVerify,
  OPERATIONS,
  unicodeEscapeDecode,
  unicodeEscapeEncode,
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

describe("jwt parts", () => {
  const VALID_TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
    ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  it("decodes into pretty header/payload + raw signature", () => {
    const p = jwtDecodeParts(VALID_TOKEN);
    expect(JSON.parse(p.header)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(p.payload)).toEqual({
      sub: "1234567890",
      name: "John Doe",
      iat: 1516239022,
    });
    expect(p.signature).toBe("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  });

  it("rejects non-3-part token", () => {
    expect(() => jwtDecodeParts("a.b")).toThrow(/3 parts \(got 2\)/);
  });

  it("re-encodes parts back to a structurally valid token", () => {
    const p = jwtDecodeParts(VALID_TOKEN);
    const t = jwtEncodeParts(p);
    expect(t.split(".")).toHaveLength(3);
    expect(jwtDecodeParts(t).payload).toEqual(p.payload);
  });

  it("keeps the signature segment verbatim on re-encode (incl. empty)", () => {
    const p = jwtDecodeParts(VALID_TOKEN);
    expect(jwtEncodeParts({ ...p, signature: "" }).endsWith(".")).toBe(true);
    expect(jwtEncodeParts({ ...p, signature: "zzz" }).endsWith(".zzz")).toBe(true);
  });

  it("throws a clear error on invalid header JSON when re-encoding", () => {
    expect(() =>
      jwtEncodeParts({ header: "not json", payload: "{}", signature: "x" }),
    ).toThrow(/header is not valid JSON/);
  });

  it("rejects a header segment that is not valid base64url", () => {
    expect(() => jwtDecodeParts("!!!.e30.sig")).toThrow(
      /header is not valid base64url/,
    );
  });

  it("rejects a header that decodes but is not JSON", () => {
    // "bm90LWpzb24" = base64url("not-json")
    expect(() => jwtDecodeParts("bm90LWpzb24.e30.sig")).toThrow(
      /header is not valid JSON/,
    );
  });

  it("rejects a payload that decodes but is not JSON", () => {
    expect(() => jwtDecodeParts("e30.bm90LWpzb24.sig")).toThrow(
      /payload is not valid JSON/,
    );
  });
});

describe("OPERATIONS registry", () => {
  it("lists all fifteen operations", () => {
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
      "base32-encode",
      "base32-decode",
      "unicode-escape-encode",
      "unicode-escape-decode",
      "decimal-encode",
      "decimal-decode",
    ]);
  });

  it("groups every operation under one of the eight known groups", () => {
    const groups = new Set(OPERATIONS.map((o) => o.group));
    expect(groups).toEqual(new Set(["Base64", "Hex", "URL", "HTML", "JWT", "Base32", "Unicode", "Decimal"]));
  });
});

describe("jwtVerify HS / none / temporal", () => {
  // jwt.io classic HS256 sample; secret is the jwt.io default.
  const HS = {
    token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
      ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
      ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    secret: "your-256-bit-secret",
  };

  it("verifies a valid HS256 token", async () => {
    const v = await jwtVerify(HS.token, HS.secret);
    expect(v.signature).toBe("valid");
    expect(v.alg).toBe("HS256");
  });

  it("reports invalid on wrong secret", async () => {
    const v = await jwtVerify(HS.token, "wrong-secret");
    expect(v.signature).toBe("invalid");
  });

  it("flags alg:none (any casing) as unsigned, no crypto", async () => {
    // header {"alg":"NoNe"}  payload {"sub":"x"}
    const header = base64urlJson({ alg: "NoNe" });
    const payload = base64urlJson({ sub: "x" });
    const v = await jwtVerify(`${header}.${payload}.`, "irrelevant");
    expect(v.signature).toBe("unsigned");
    expect(v.warnings.join(" ")).toMatch(/alg: none/i);
  });

  it("computes temporal independently of signature", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const future = Math.floor(Date.now() / 1000) + 3600;
    const header = base64urlJson({ alg: "HS256" });
    const payload = base64urlJson({ exp: past, nbf: future });
    // Bad signature on purpose; temporal still computed.
    const v = await jwtVerify(`${header}.${payload}.bad`, "secret");
    expect(v.signature).toBe("invalid");
    expect(v.temporal.expired).toBe(true);
    expect(v.temporal.notYetValid).toBe(true);
  });

  it("returns an error envelope, never throws, on garbage", async () => {
    const v = await jwtVerify("not-a-jwt", "k");
    expect(v.signature).toBe("error");
    expect(typeof v.detail).toBe("string");
  });
});

// Local test helper: base64url-encode a JSON object.
function base64urlJson(obj: unknown): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("jwtVerify asymmetric", () => {
  function b64url(bytes: ArrayBuffer): string {
    let s = "";
    const u = new Uint8Array(bytes);
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlStr(str: string): string {
    return btoa(str)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  async function spkiPem(pub: CryptoKey): Promise<string> {
    const spki = await crypto.subtle.exportKey("spki", pub);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
    const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
    return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
  }
  async function makeToken(
    alg: string,
    importAlg: EcKeyGenParams | RsaHashedKeyGenParams,
    signAlg: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
  ): Promise<{ token: string; pub: CryptoKey }> {
    const kp = (await crypto.subtle.generateKey(importAlg, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const header = b64urlStr(JSON.stringify({ alg }));
    const payload = b64urlStr(JSON.stringify({ sub: "x" }));
    const sig = await crypto.subtle.sign(
      signAlg,
      kp.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    return { token: `${header}.${payload}.${b64url(sig)}`, pub: kp.publicKey };
  }

  it("verifies RS256 via PEM SPKI", async () => {
    const { token, pub } = await makeToken(
      "RS256",
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      "RSASSA-PKCS1-v1_5",
    );
    const v = await jwtVerify(token, await spkiPem(pub));
    expect(v.signature).toBe("valid");
  });

  it("verifies ES256 via JWK", async () => {
    const { token, pub } = await makeToken(
      "ES256",
      { name: "ECDSA", namedCurve: "P-256" },
      { name: "ECDSA", hash: "SHA-256" },
    );
    const jwk = await crypto.subtle.exportKey("jwk", pub);
    const v = await jwtVerify(token, JSON.stringify(jwk));
    expect(v.signature).toBe("valid");
  });

  it("verifies PS256 and rejects a tampered payload", async () => {
    const { token, pub } = await makeToken(
      "PS256",
      { name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      { name: "RSA-PSS", saltLength: 32 },
    );
    expect((await jwtVerify(token, await spkiPem(pub))).signature).toBe("valid");
    const bad = token.replace(/\.[^.]+$/, ".AAAA");
    expect((await jwtVerify(bad, await spkiPem(pub))).signature).toBe("invalid");
  });

  it("selects the JWKS key by header kid", async () => {
    const { token, pub } = await makeToken(
      "ES256",
      { name: "ECDSA", namedCurve: "P-256" },
      { name: "ECDSA", hash: "SHA-256" },
    );
    // Re-issue token with a kid in the header.
    const [, payloadSeg] = token.split(".");
    const header = b64urlStr(JSON.stringify({ alg: "ES256", kid: "k2" }));
    const kp2 = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      kp2.privateKey,
      new TextEncoder().encode(`${header}.${payloadSeg}`),
    );
    const signed = `${header}.${payloadSeg}.${b64url(sig)}`;
    const jwk1 = { ...(await crypto.subtle.exportKey("jwk", pub)), kid: "k1" };
    const jwk2 = {
      ...(await crypto.subtle.exportKey("jwk", kp2.publicKey)),
      kid: "k2",
    };
    const v = await jwtVerify(signed, JSON.stringify({ keys: [jwk1, jwk2] }));
    expect(v.signature).toBe("valid");
  });

  it("errors when no JWKS key matches the kid", async () => {
    // Token's header carries kid: "missing"; JWKS has 2 keys with DIFFERENT
    // kids, so the single-key fallback is disabled and the error branch fires.
    const kp = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const header = b64urlStr(JSON.stringify({ alg: "ES256", kid: "missing" }));
    const payload = b64urlStr(JSON.stringify({ sub: "x" }));
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      kp.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    const token = `${header}.${payload}.${b64url(sig)}`;
    const otherA = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const otherB = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const jwkA = {
      ...(await crypto.subtle.exportKey("jwk", otherA.publicKey)),
      kid: "a",
    };
    const jwkB = {
      ...(await crypto.subtle.exportKey("jwk", otherB.publicKey)),
      kid: "b",
    };
    const v = await jwtVerify(
      token,
      JSON.stringify({ keys: [jwkA, jwkB] }),
    );
    expect(v.signature).toBe("error");
    expect(v.detail).toMatch(/No matching key in JWKS for kid 'missing'/);
  });

  it("verifies ES384 via PEM SPKI", async () => {
    const { token, pub } = await makeToken(
      "ES384",
      { name: "ECDSA", namedCurve: "P-384" },
      { name: "ECDSA", hash: "SHA-384" },
    );
    const v = await jwtVerify(token, await spkiPem(pub));
    expect(v.signature).toBe("valid");
  });

  it("warns when an asymmetric alg gets a raw-secret-shaped key", async () => {
    // Token signed with RS256 but verifier supplied a non-PEM/non-JSON
    // string. Verification will fail at importKey (caught -> error envelope),
    // but the warning must be emitted before importKey is called.
    const { token } = await makeToken(
      "RS256",
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      "RSASSA-PKCS1-v1_5",
    );
    const v = await jwtVerify(token, "definitely-a-raw-secret");
    expect(v.warnings.join(" ")).toMatch(
      /Expected a public key \(PEM\/JWK\/JWKS\) for RS256; got a raw secret\./,
    );
  });
});

describe("jwtVerify EdDSA", () => {
  it("verifies EdDSA where supported, else reports unsupported-alg", async () => {
    let kp: CryptoKeyPair | null = null;
    try {
      kp = (await crypto.subtle.generateKey("Ed25519", true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
    } catch {
      kp = null;
    }
    const b64urlStr = (s: string) =>
      btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const header = b64urlStr(JSON.stringify({ alg: "EdDSA" }));
    const payload = b64urlStr(JSON.stringify({ sub: "x" }));

    if (kp === null) {
      const v = await jwtVerify(`${header}.${payload}.AAAA`, "{}");
      expect(v.signature).toBe("unsupported-alg");
      expect(v.detail).toMatch(/Ed25519/);
      return;
    }
    const sigBuf = await crypto.subtle.sign(
      "Ed25519",
      kp.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    let bin = "";
    const u = new Uint8Array(sigBuf);
    for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    const sig = btoa(bin)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
    const v = await jwtVerify(
      `${header}.${payload}.${sig}`,
      JSON.stringify(jwk),
    );
    expect(v.signature).toBe("valid");
  });

  it("EdDSA: errors when JWKS has no matching kid (skipped if unsupported)", async () => {
    let kp: CryptoKeyPair | null = null;
    try {
      kp = (await crypto.subtle.generateKey("Ed25519", true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
    } catch {
      kp = null;
    }
    if (kp === null) return; // skip when Ed25519 unsupported
    const b64urlStr = (s: string) =>
      btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const header = b64urlStr(JSON.stringify({ alg: "EdDSA", kid: "missing" }));
    const payload = b64urlStr(JSON.stringify({ sub: "x" }));
    const sigBuf = await crypto.subtle.sign(
      "Ed25519",
      kp.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    let bin = "";
    const u = new Uint8Array(sigBuf);
    for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    const sig = btoa(bin)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    // Build a 2-key JWKS with kids that don't match "missing".
    const a = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
    const b = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
    const jwkA = { ...(await crypto.subtle.exportKey("jwk", a.publicKey)), kid: "a" };
    const jwkB = { ...(await crypto.subtle.exportKey("jwk", b.publicKey)), kid: "b" };
    const v = await jwtVerify(
      `${header}.${payload}.${sig}`,
      JSON.stringify({ keys: [jwkA, jwkB] }),
    );
    expect(v.signature).toBe("error");
    expect(v.detail).toMatch(/No matching key in JWKS for kid 'missing'/);
  });
});

describe("jwtHmacResign", () => {
  it("produces a token that verifies with the same secret", async () => {
    const t = await jwtHmacResign(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
      JSON.stringify({ sub: "forged" }),
      "s3cr3t",
      "HS256",
    );
    expect((await jwtVerify(t, "s3cr3t")).signature).toBe("valid");
    expect((await jwtVerify(t, "nope")).signature).toBe("invalid");
  });

  it("supports HS384/HS512", async () => {
    const t = await jwtHmacResign(
      JSON.stringify({ alg: "HS512" }),
      "{}",
      "k",
      "HS512",
    );
    expect((await jwtVerify(t, "k")).signature).toBe("valid");
  });

  it("throws a clear error on invalid header JSON", async () => {
    await expect(
      jwtHmacResign("not json", "{}", "k", "HS256"),
    ).rejects.toThrow(/header is not valid JSON/);
  });
});

describe("base32", () => {
  // RFC 4648 §10 test vectors
  it("encodes the RFC 4648 vectors", () => {
    expect(base32Encode("")).toBe("");
    expect(base32Encode("f")).toBe("MY======");
    expect(base32Encode("fo")).toBe("MZXQ====");
    expect(base32Encode("foo")).toBe("MZXW6===");
    expect(base32Encode("foob")).toBe("MZXW6YQ=");
    expect(base32Encode("fooba")).toBe("MZXW6YTB");
    expect(base32Encode("foobar")).toBe("MZXW6YTBOI======");
  });

  it("decodes the RFC 4648 vectors", () => {
    expect(base32Decode("MZXW6YTBOI======")).toBe("foobar");
    expect(base32Decode("MY======")).toBe("f");
  });

  it("decodes case-insensitively and ignores whitespace", () => {
    expect(base32Decode("mzxw6 ytboi======")).toBe("foobar");
  });

  it("throws on an invalid Base32 character", () => {
    expect(() => base32Decode("MZXW1!!!")).toThrow(/Invalid Base32/);
  });

  it("round-trips arbitrary unicode text", () => {
    const validText = fc
      .array(
        fc
          .integer({ min: 0, max: 0x10ffff })
          .filter((c) => c < 0xd800 || c > 0xdfff),
      )
      .map((arr) => String.fromCodePoint(...arr));
    fc.assert(
      fc.property(validText, (s) => {
        expect(base32Decode(base32Encode(s))).toBe(s);
      }),
    );
  });
});

describe("unicode escape", () => {
  it("encodes every character as \\uXXXX (lowercase hex)", () => {
    expect(unicodeEscapeEncode("AB")).toBe("\\u0041\\u0042");
  });

  it("encodes astral characters as a surrogate pair", () => {
    expect(unicodeEscapeEncode("\u{1f600}")).toBe("\\ud83d\\ude00");
  });

  it("decodes \\uXXXX including surrogate pairs", () => {
    expect(unicodeEscapeDecode("\\u0041\\u0042")).toBe("AB");
    expect(unicodeEscapeDecode("\\ud83d\\ude00")).toBe("\u{1f600}");
  });

  it("decodes the \\u{...} form", () => {
    expect(unicodeEscapeDecode("\\u{1f600}")).toBe("\u{1f600}");
  });

  it("passes non-escape text through unchanged", () => {
    expect(unicodeEscapeDecode("hi \\u0041 x")).toBe("hi A x");
  });

  it("round-trips arbitrary text", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(unicodeEscapeDecode(unicodeEscapeEncode(s))).toBe(s);
      }),
    );
  });
});

describe("decimal char codes", () => {
  it("encodes to space-separated decimal code points", () => {
    expect(decimalEncode("AB")).toBe("65 66");
    expect(decimalEncode("\u{1f600}")).toBe("128512");
  });

  it("decodes space- and comma-separated codes", () => {
    expect(decimalDecode("65 66")).toBe("AB");
    expect(decimalDecode("72,73")).toBe("HI");
    expect(decimalDecode("128512")).toBe("\u{1f600}");
  });

  it("returns empty string for empty input", () => {
    expect(decimalDecode("")).toBe("");
  });

  it("throws on a non-numeric token", () => {
    expect(() => decimalDecode("65 zz")).toThrow(/Invalid decimal code/);
  });

  it("throws on an out-of-range code point", () => {
    expect(() => decimalDecode("1114112")).toThrow(/Code point out of range/);
  });

  it("round-trips arbitrary unicode text", () => {
    const validText = fc
      .array(
        fc
          .integer({ min: 0, max: 0x10ffff })
          .filter((c) => c < 0xd800 || c > 0xdfff),
      )
      .map((arr) => String.fromCodePoint(...arr));
    fc.assert(
      fc.property(validText, (s) => {
        expect(decimalDecode(decimalEncode(s))).toBe(s);
      }),
    );
  });
});
