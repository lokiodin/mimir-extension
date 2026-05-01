import type { DetectorMeta } from "../types";

// Curated short list of TLDs to keep "foo.bar" from being flagged as a
// hostname. Covers the long tail of cybersec-relevant TLDs without pulling
// in the full IANA list.
const TLDS = [
  "com",
  "net",
  "org",
  "io",
  "co",
  "uk",
  "us",
  "de",
  "fr",
  "ca",
  "au",
  "jp",
  "cn",
  "ru",
  "br",
  "in",
  "info",
  "biz",
  "edu",
  "gov",
  "mil",
  "int",
  "name",
  "pro",
  "dev",
  "app",
  "ai",
  "tech",
  "cloud",
  "online",
  "site",
  "xyz",
  "top",
  "live",
  "store",
  "shop",
  "blog",
  "news",
  "me",
  "tv",
  "fm",
  "to",
  "ly",
  "cc",
  "ws",
  "se",
  "no",
  "fi",
  "nl",
  "be",
  "it",
  "es",
  "pl",
  "ch",
  "at",
  "ie",
  "dk",
  "cz",
  "kr",
  "tw",
  "hk",
  "sg",
  "nz",
  "za",
  "mx",
  "ar",
  "cl",
  "pe",
  "tr",
  "il",
  "ae",
  "sa",
  "th",
  "vn",
  "id",
  "ph",
  "my",
  "ng",
  "ke",
  "eg",
  "icu",
  "wtf",
  "lol",
  "gg",
  "page",
  "host",
  "space",
];

const TLD_GROUP = TLDS.join("|");

// Note: leading lookbehind only blocks word/dot — `@` is allowed so the
// domain part of an email is detected here. Stage 1's overlap pass then
// drops it because email runs first and claims the range.
const FQDN_RE = new RegExp(
  String.raw`(?<![\w.])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:` +
    TLD_GROUP +
    String.raw`)\b`,
  "gi",
);

export const fqdn: DetectorMeta = {
  id: "fqdn",
  label: "FQDN",
  priority: 11,
  defaultConfidence: 0.7,
  placeholderPrefix: "DOMAIN",
  detect(text) {
    const out = [];
    for (const m of text.matchAll(FQDN_RE)) {
      const start = m.index ?? 0;
      out.push({
        type: "fqdn",
        start,
        end: start + m[0].length,
        original: m[0],
      });
    }
    return out;
  },
};
