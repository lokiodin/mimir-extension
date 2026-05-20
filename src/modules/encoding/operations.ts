export type OperationId =
  | "base64-encode"
  | "base64-decode"
  | "hex-encode"
  | "hex-decode"
  | "url-encode"
  | "url-decode"
  | "html-encode"
  | "html-decode"
  | "jwt-decode";

export interface Operation {
  id: OperationId;
  label: string;
  group: string;
  fn: (input: string) => string;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  return btoa(bytesToBinaryString(bytes));
}

export function base64Decode(input: string): string {
  let binary: string;
  try {
    binary = atob(input);
  } catch (e) {
    throw new Error(
      `Invalid Base64: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return new TextDecoder().decode(binaryStringToBytes(binary));
}

export function hexEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function hexDecode(input: string): string {
  let cleaned = input.replace(/\s+/g, "");
  if (cleaned.startsWith("0x") || cleaned.startsWith("0X")) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned === "") return "";
  if (cleaned.length % 2 !== 0) {
    throw new Error(
      `Invalid hex: length must be even (got ${cleaned.length})`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error("Invalid hex: contains non-hex characters");
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch (e) {
    throw new Error(
      `Invalid URL encoding: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function htmlEncode(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const HTML_NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// Limited to the standard 5 + nbsp + numeric (decimal and hex). The full
// HTML5 named-entity table is intentionally out of scope; unknown entities
// pass through unchanged so partial decode still aids log triage.
export function htmlDecode(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/g,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = parseInt(entity.slice(2), 16);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      if (entity.startsWith("#")) {
        const code = parseInt(entity.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return HTML_NAMED[entity] ?? match;
    },
  );
}

function base64UrlDecodeToString(segment: string): string {
  let normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder === 2) normalized += "==";
  else if (remainder === 3) normalized += "=";
  else if (remainder === 1) {
    throw new Error("invalid length");
  }
  let binary: string;
  try {
    binary = atob(normalized);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
  return new TextDecoder().decode(binaryStringToBytes(binary));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return btoa(bytesToBinaryString(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(s));
}

// Used by jwtVerify in Task 2 (needs raw signature bytes for crypto.subtle.verify).
function base64UrlToBytes(segment: string): Uint8Array<ArrayBuffer> {
  let normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder === 2) normalized += "==";
  else if (remainder === 3) normalized += "=";
  else if (remainder === 1) throw new Error("invalid length");
  let binary: string;
  try {
    binary = atob(normalized);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
  return new Uint8Array(binaryStringToBytes(binary)) as Uint8Array<ArrayBuffer>;
}

export interface JwtParts {
  header: string; // pretty JSON text
  payload: string; // pretty JSON text
  signature: string; // raw base64url segment (may be empty)
}

export function jwtDecodeParts(token: string): JwtParts {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error(`JWT must have 3 parts (got ${parts.length})`);
  }
  const [headerSeg, payloadSeg, sigSeg] = parts;

  let headerStr: string;
  try {
    headerStr = base64UrlDecodeToString(headerSeg);
  } catch (e) {
    throw new Error(
      `JWT header is not valid base64url: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  let payloadStr: string;
  try {
    payloadStr = base64UrlDecodeToString(payloadSeg);
  } catch (e) {
    throw new Error(
      `JWT payload is not valid base64url: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let header: unknown;
  try {
    header = JSON.parse(headerStr);
  } catch {
    throw new Error("JWT header is not valid JSON");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    throw new Error("JWT payload is not valid JSON");
  }

  return {
    header: JSON.stringify(header, null, 2),
    payload: JSON.stringify(payload, null, 2),
    signature: sigSeg,
  };
}

export function jwtEncodeParts(parts: JwtParts): string {
  let header: unknown;
  try {
    header = JSON.parse(parts.header);
  } catch {
    throw new Error("JWT header is not valid JSON");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(parts.payload);
  } catch {
    throw new Error("JWT payload is not valid JSON");
  }
  // JSON.stringify (default) produces compact key-stable output, which is
  // the correct canonical form for the JWT signing input.
  const h = base64UrlEncodeString(JSON.stringify(header));
  const p = base64UrlEncodeString(JSON.stringify(payload));
  return `${h}.${p}.${parts.signature}`;
}

export type JwtSignatureStatus =
  | "valid"
  | "invalid"
  | "unsigned"
  | "unsupported-alg"
  | "error";

export interface JwtVerdict {
  signature: JwtSignatureStatus;
  alg: string;
  temporal: { expired?: boolean; notYetValid?: boolean; iatFuture?: boolean };
  warnings: string[];
  detail?: string;
}

function pemToBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return new Uint8Array(binaryStringToBytes(atob(body))) as Uint8Array<ArrayBuffer>;
}

interface AsymParams {
  importParams: RsaHashedImportParams | EcKeyImportParams | Algorithm;
  verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
}

function hashForAlg(alg: string): "SHA-256" | "SHA-384" | "SHA-512" {
  if (alg.endsWith("256")) return "SHA-256";
  if (alg.endsWith("384")) return "SHA-384";
  if (alg.endsWith("512")) return "SHA-512";
  throw new Error(`Unsupported alg: ${alg}`);
}

function computeTemporal(payload: unknown): JwtVerdict["temporal"] {
  const t: JwtVerdict["temporal"] = {};
  if (typeof payload !== "object" || payload === null) return t;
  const p = payload as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  if (typeof p.exp === "number" && now >= p.exp) t.expired = true;
  if (typeof p.nbf === "number" && now < p.nbf) t.notYetValid = true;
  if (typeof p.iat === "number" && p.iat > now) t.iatFuture = true;
  return t;
}

function asymParamsForAlg(alg: string): AsymParams {
  if (alg.startsWith("RS")) {
    const hash = hashForAlg(alg);
    return {
      importParams: { name: "RSASSA-PKCS1-v1_5", hash },
      verifyParams: "RSASSA-PKCS1-v1_5",
    };
  }
  if (alg.startsWith("PS")) {
    const hash = hashForAlg(alg);
    const saltLength = hash === "SHA-256" ? 32 : hash === "SHA-384" ? 48 : 64;
    return {
      importParams: { name: "RSA-PSS", hash },
      verifyParams: { name: "RSA-PSS", saltLength },
    };
  }
  if (alg.startsWith("ES")) {
    const namedCurve =
      alg === "ES256" ? "P-256" : alg === "ES384" ? "P-384" : "P-521";
    const hash =
      alg === "ES256" ? "SHA-256" : alg === "ES384" ? "SHA-384" : "SHA-512";
    return {
      importParams: { name: "ECDSA", namedCurve },
      verifyParams: { name: "ECDSA", hash },
    };
  }
  throw new Error(`Unsupported alg: ${alg}`);
}

async function importAsymKey(
  key: string,
  headerKid: string | undefined,
  params: AsymParams,
): Promise<CryptoKey> {
  const trimmed = key.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return crypto.subtle.importKey(
      "spki",
      pemToBytes(trimmed),
      params.importParams,
      false,
      ["verify"],
    );
  }
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  if (Array.isArray(parsed.keys)) {
    const keys = parsed.keys as Array<Record<string, unknown>>;
    let chosen: Record<string, unknown> | undefined;
    if (headerKid) chosen = keys.find((k) => k.kid === headerKid);
    if (!chosen && keys.length === 1) chosen = keys[0];
    if (!chosen) {
      throw new Error(
        `No matching key in JWKS for kid '${headerKid ?? "(none)"}'.`,
      );
    }
    return crypto.subtle.importKey(
      "jwk",
      chosen as JsonWebKey,
      params.importParams,
      false,
      ["verify"],
    );
  }
  return crypto.subtle.importKey(
    "jwk",
    parsed as JsonWebKey,
    params.importParams,
    false,
    ["verify"],
  );
}

export async function jwtVerify(
  token: string,
  key: string,
): Promise<JwtVerdict> {
  const warnings: string[] = [];
  let alg = "";
  let temporal: JwtVerdict["temporal"] = {};
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {
        signature: "error",
        alg,
        temporal,
        warnings,
        detail: `JWT must have 3 parts (got ${parts.length})`,
      };
    }
    const [headerSeg, payloadSeg, sigSeg] = parts;
    const header = JSON.parse(base64UrlDecodeToString(headerSeg)) as Record<
      string,
      unknown
    >;
    const payload = JSON.parse(base64UrlDecodeToString(payloadSeg));
    alg = typeof header.alg === "string" ? header.alg : "";
    temporal = computeTemporal(payload);

    if (alg.toLowerCase() === "none") {
      warnings.push("Token is unsigned (alg: none) — signature not verified.");
      return { signature: "unsigned", alg, temporal, warnings };
    }

    // Heuristic: treats any {-prefixed string as a JWK/JWKS; a JSON-shaped
    // HMAC secret would trigger a false-positive warning — acceptable per spec §3.4.
    const looksAsymmetricKey =
      key.includes("-----BEGIN") || key.trimStart().startsWith("{");

    if (alg.startsWith("HS")) {
      if (looksAsymmetricKey) {
        warnings.push(
          "Possible algorithm-confusion: asymmetric public key supplied for an HMAC (HS*) token (RS→HS attack pattern).",
        );
      }
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(key),
        { name: "HMAC", hash: hashForAlg(alg) },
        false,
        ["verify"],
      );
      const ok = await crypto.subtle.verify(
        "HMAC",
        cryptoKey,
        base64UrlToBytes(sigSeg),
        new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
      );
      return { signature: ok ? "valid" : "invalid", alg, temporal, warnings };
    }

    if (
      alg.startsWith("RS") ||
      alg.startsWith("PS") ||
      alg.startsWith("ES")
    ) {
      if (!looksAsymmetricKey) {
        warnings.push(
          `Expected a public key (PEM/JWK/JWKS) for ${alg}; got a raw secret.`,
        );
      }
      const kid =
        typeof header.kid === "string" ? header.kid : undefined;
      const params = asymParamsForAlg(alg);
      const cryptoKey = await importAsymKey(key, kid, params);
      const ok = await crypto.subtle.verify(
        params.verifyParams,
        cryptoKey,
        base64UrlToBytes(sigSeg),
        new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
      );
      return { signature: ok ? "valid" : "invalid", alg, temporal, warnings };
    }

    if (alg === "EdDSA") {
      if (!looksAsymmetricKey) {
        warnings.push(
          `Expected a public key (PEM/JWK/JWKS) for ${alg}; got a raw secret.`,
        );
      }
      try {
        const kid =
          typeof header.kid === "string" ? header.kid : undefined;
        let cryptoKey: CryptoKey;
        const trimmed = key.trim();
        if (trimmed.startsWith("-----BEGIN")) {
          cryptoKey = await crypto.subtle.importKey(
            "spki",
            pemToBytes(trimmed),
            "Ed25519",
            false,
            ["verify"],
          );
        } else {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          let jwk: Record<string, unknown> | null;
          if (Array.isArray(parsed.keys)) {
            const keys = parsed.keys as Array<Record<string, unknown>>;
            jwk = kid
              ? (keys.find((k) => k.kid === kid) ?? null)
              : keys.length === 1
                ? keys[0]
                : null;
          } else {
            jwk = parsed;
          }
          if (jwk === null) {
            throw new Error(
              `No matching key in JWKS for kid '${kid ?? "(none)"}'.`,
            );
          }
          cryptoKey = await crypto.subtle.importKey(
            "jwk",
            jwk as JsonWebKey,
            "Ed25519",
            false,
            ["verify"],
          );
        }
        const ok = await crypto.subtle.verify(
          "Ed25519",
          cryptoKey,
          base64UrlToBytes(sigSeg),
          new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
        );
        return { signature: ok ? "valid" : "invalid", alg, temporal, warnings };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/No matching key/.test(msg)) {
          return { signature: "error", alg, temporal, warnings, detail: msg };
        }
        if (e instanceof DOMException && e.name === "NotSupportedError") {
          return {
            signature: "unsupported-alg",
            alg,
            temporal,
            warnings,
            detail:
              "EdDSA (Ed25519) requires Chrome ≥137 / Firefox ≥130; this browser's Web Crypto lacks it.",
          };
        }
        return { signature: "error", alg, temporal, warnings, detail: msg };
      }
    }

    return {
      signature: "unsupported-alg",
      alg,
      temporal,
      warnings,
      detail: `Algorithm ${alg} not yet implemented.`,
    };
  } catch (e) {
    return {
      signature: "error",
      alg,
      temporal,
      warnings,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

// HMAC re-sign over the (re-encoded) header.payload. The caller supplies the
// secret string. For the RS->HS confusion attack the caller passes the pasted
// public-key text as `secret` and picks the HS* variant by the original alg's
// hash size (RS256/ES256/PS256/EdDSA -> HS256, *384 -> HS384, *512 -> HS512).
export async function jwtHmacResign(
  headerJson: string,
  payloadJson: string,
  secret: string,
  hsAlg: "HS256" | "HS384" | "HS512",
): Promise<string> {
  let header: unknown;
  try {
    header = JSON.parse(headerJson);
  } catch {
    throw new Error("JWT header is not valid JSON");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("JWT payload is not valid JSON");
  }
  const hash =
    hsAlg === "HS256" ? "SHA-256" : hsAlg === "HS384" ? "SHA-384" : "SHA-512";
  const signingInput =
    base64UrlEncodeString(JSON.stringify(header)) +
    "." +
    base64UrlEncodeString(JSON.stringify(payload));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${base64UrlEncodeBytes(sig)}`;
}

// Signature verification is intentionally deferred to v1.1+ per PRD §7.1.
export function jwtDecode(input: string): string {
  const parts = input.split(".");
  if (parts.length !== 3) {
    throw new Error(`JWT must have 3 parts (got ${parts.length})`);
  }
  const [headerSeg, payloadSeg] = parts;

  let headerStr: string;
  try {
    headerStr = base64UrlDecodeToString(headerSeg);
  } catch (e) {
    throw new Error(
      `JWT header is not valid base64url: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  let payloadStr: string;
  try {
    payloadStr = base64UrlDecodeToString(payloadSeg);
  } catch (e) {
    throw new Error(
      `JWT payload is not valid base64url: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let header: unknown;
  try {
    header = JSON.parse(headerStr);
  } catch {
    throw new Error("JWT header is not valid JSON");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    throw new Error("JWT payload is not valid JSON");
  }

  return (
    JSON.stringify(header, null, 2) + "\n\n" + JSON.stringify(payload, null, 2)
  );
}

export const OPERATIONS: ReadonlyArray<Operation> = [
  { id: "base64-encode", label: "Base64 encode", group: "Base64", fn: base64Encode },
  { id: "base64-decode", label: "Base64 decode", group: "Base64", fn: base64Decode },
  { id: "hex-encode", label: "Hex encode", group: "Hex", fn: hexEncode },
  { id: "hex-decode", label: "Hex decode", group: "Hex", fn: hexDecode },
  { id: "url-encode", label: "URL encode", group: "URL", fn: urlEncode },
  { id: "url-decode", label: "URL decode", group: "URL", fn: urlDecode },
  { id: "html-encode", label: "HTML encode", group: "HTML", fn: htmlEncode },
  { id: "html-decode", label: "HTML decode", group: "HTML", fn: htmlDecode },
  { id: "jwt-decode", label: "JWT decode", group: "JWT", fn: jwtDecode },
];
