// Defang/refang for URLs, IPv4 addresses, and standalone domains. v1 scope:
// the canonical bracketed-dot convention only — `http(s)://` ↔ `hxxp(s)[://]`
// and `.` ↔ `[.]`. Other defang dialects (`(dot)`, `hXXp`, `[://]` without
// bracketed scheme letters, `.example[.]com`) are deferred.

// URL match: scheme-prefixed runs, terminated by whitespace or characters
// that don't appear inside URLs in practice. The host portion (between
// `://` and the first `/`, `?`, or `#`) is the only place we replace dots —
// paths and query strings keep their literal dots.
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
// Liberal: munged scheme hxxp/hxxps (any case via the i flag) followed by any
// of [://] (canonical), [:]// , or a real ://. Colon-defang recognition is
// scoped to the scheme so a bare [:] in log text (key[:]value) is left alone.
const REFANG_URL_RE =
  /\bhxxps?(?:\[:\/\/\]|\[:\]\/\/|:\/\/)[^\s<>"'`]+/gi;

// IPv4: four 1-3 digit octets separated by `.`. Surrounded by non-digit /
// non-dot context so a 5-octet sequence (`1.2.3.4.5`) and version-string
// fragments don't get partially matched. Octet range is enforced in the
// callback so we can keep the regex simple.
const IP_RE =
  /(?<![\d.[])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\.?\d)/g;
const REFANG_IP_RE =
  /(?<![\d\]])(\d{1,3})\[\.\](\d{1,3})\[\.\](\d{1,3})\[\.\](\d{1,3})(?!\[\.\]\d|\d)/g;

// Standalone domain: at least one label, then a 2-63 char alpha TLD. Labels
// are alphanumeric with optional internal hyphens, can't start/end with a
// hyphen. Boundary lookarounds prevent matching inside file paths
// (`/foo.bar/`) or longer dotted runs. Known v1 false positives: filenames
// with short alpha extensions outside URL contexts (`README.md`, plain
// `report.pdf`) match. Filenames *inside* a URL's path are protected by
// the single-pass scanner — see `scanAndReplace` below.
const DOMAIN_RE =
  /(?<![\w.\-])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}(?![\w.\-])/g;
const REFANG_DOMAIN_RE =
  /(?<![\w\-\]])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\[\.\])+[a-zA-Z]{2,63}(?![\w\-[])/g;

const HOST_END_RE = /[/?#]/;

// Email: defang the @ and the domain dots; the local part is left literal so
// the address round-trips. Claimed before the bare-domain rule. Single-label
// domains (user@localhost) are excluded on both sides — consistent with the
// domain rule's TLD requirement, so such addresses pass through unchanged.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}\b/g;
// Refang needs a dedicated whole-address rule: the generic domain-refang
// lookbehind excludes a preceding ']', so it would skip the domain right after
// [at]. This rule restores both [at]/(at) -> @ and [.] -> . in one claim.
const REFANG_EMAIL_RE =
  /\b[A-Za-z0-9._%+-]+(?:\[at\]|\(at\))(?:[A-Za-z0-9-]+\[\.\])+[A-Za-z]{2,63}\b/gi;

// IPv6 — conservative: matches only a full 8-group address OR one containing a
// :: compression. This excludes MAC addresses (6 groups, no ::) and 2-4 group
// timestamps. Boundary lookarounds (not \b) let a leading :: match. Known
// residual FPs: an 8-group all-hex colon run that is not actually an address;
// a bare `::` in prose (a valid all-zeros address, but rare as a real IOC).
const IPV6_RE =
  /(?<![0-9A-Za-z:.\[])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?::(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?)(?![0-9A-Za-z:.\]])/g;
const REFANG_IPV6_RE =
  /(?<![0-9A-Za-z\[\]])(?:(?:[0-9A-Fa-f]{1,4}\[:\]){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}(?:\[:\][0-9A-Fa-f]{1,4})*)?\[:\]\[:\](?:[0-9A-Fa-f]{1,4}(?:\[:\][0-9A-Fa-f]{1,4})*)?)(?![0-9A-Za-z\[])/g;

interface Rule {
  re: RegExp;
  // Return `null` to signal "no change — let later rules try this span."
  // Used by the IP rule to abandon matches with octets > 255 so the domain
  // rule doesn't try to defang things like `999.999.999.999`.
  transform: (match: string, ...captures: string[]) => string | null;
}

// Single pass: each rule fires in priority order; a later rule only fires on
// spans no earlier rule has already claimed. This prevents the domain rule
// from re-processing a URL's path/query (which already passed through the
// URL rule and contains literal dots that should stay literal).
function scanAndReplace(input: string, rules: ReadonlyArray<Rule>): string {
  interface Claim {
    start: number;
    end: number;
    replacement: string;
  }
  const claims: Claim[] = [];

  for (const rule of rules) {
    for (const m of input.matchAll(rule.re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (claims.some((c) => start < c.end && end > c.start)) continue;
      const replacement = rule.transform(m[0], ...m.slice(1));
      if (replacement === null) continue;
      claims.push({ start, end, replacement });
    }
  }

  claims.sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const c of claims) {
    if (c.start < cursor) continue;
    result += input.slice(cursor, c.start);
    result += c.replacement;
    cursor = c.end;
  }
  result += input.slice(cursor);
  return result;
}

function defangUrlMatch(match: string): string {
  const lower = match.toLowerCase();
  const isHttps = lower.startsWith("https://");
  const schemeLen = isHttps ? "https://".length : "http://".length;
  const defangedScheme = isHttps ? "hxxps[://]" : "hxxp[://]";
  const rest = match.slice(schemeLen);
  const hostEnd = rest.search(HOST_END_RE);
  const host = hostEnd === -1 ? rest : rest.slice(0, hostEnd);
  const tail = hostEnd === -1 ? "" : rest.slice(hostEnd);
  return defangedScheme + host.replace(/\./g, "[.]") + tail;
}

function refangUrlMatch(match: string): string {
  const isHttps = /^hxxps/i.test(match);
  // match was delivered by REFANG_URL_RE, which requires one of these three
  // separators — a null here means the two regexes have drifted apart.
  const sepMatch = /^hxxps?(\[:\/\/\]|\[:\]\/\/|:\/\/)/i.exec(match);
  if (!sepMatch) throw new Error(`refangUrlMatch: unrecognized separator in '${match}'`);
  const sep = sepMatch[1];
  const schemeLen = "hxx".length + (isHttps ? 2 : 1) + sep.length;
  const refangedScheme = isHttps ? "https://" : "http://";
  const rest = match.slice(schemeLen);
  const hostEnd = rest.search(HOST_END_RE);
  const host = hostEnd === -1 ? rest : rest.slice(0, hostEnd);
  const tail = hostEnd === -1 ? "" : rest.slice(hostEnd);
  return refangedScheme + host.replace(/\[\.\]/g, ".") + tail;
}

function defangEmail(match: string): string {
  const at = match.indexOf("@");
  const local = match.slice(0, at);
  const domain = match.slice(at + 1);
  return local + "[at]" + domain.replace(/\./g, "[.]");
}

function refangEmail(match: string): string {
  return match.replace(/\[at\]|\(at\)/gi, "@").replace(/\[\.\]/g, ".");
}

function isOctet(s: string): boolean {
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

const DEFANG_RULES: ReadonlyArray<Rule> = [
  { re: URL_RE, transform: (match) => defangUrlMatch(match) },
  { re: EMAIL_RE, transform: (match) => defangEmail(match) },
  {
    re: IP_RE,
    transform: (_match, a: string, b: string, c: string, d: string) => {
      if (!isOctet(a) || !isOctet(b) || !isOctet(c) || !isOctet(d)) return null;
      return `${a}[.]${b}[.]${c}[.]${d}`;
    },
  },
  { re: IPV6_RE, transform: (match) => match.replace(/:/g, "[:]") },
  { re: DOMAIN_RE, transform: (match) => match.replace(/\./g, "[.]") },
];

const REFANG_RULES: ReadonlyArray<Rule> = [
  { re: REFANG_URL_RE, transform: (match) => refangUrlMatch(match) },
  { re: REFANG_EMAIL_RE, transform: (match) => refangEmail(match) },
  {
    re: REFANG_IP_RE,
    transform: (_match, a: string, b: string, c: string, d: string) =>
      `${a}.${b}.${c}.${d}`,
  },
  { re: REFANG_IPV6_RE, transform: (match) => match.replace(/\[:\]/g, ":") },
  { re: REFANG_DOMAIN_RE, transform: (match) => match.replace(/\[\.\]/g, ".") },
];

export function defangAll(input: string): string {
  return scanAndReplace(input, DEFANG_RULES);
}

export function refangAll(input: string): string {
  return scanAndReplace(input, REFANG_RULES);
}
