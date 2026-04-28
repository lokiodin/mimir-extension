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
