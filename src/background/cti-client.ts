// CTI lookup client. See TECHNICAL_DESIGN.md §6.
// VirusTotal v3 only in this session; AbuseIPDB and abuse.ch follow.

import { getApiKey } from "@/storage/manager";
import { withKeepalive } from "@/background/keepalive";
import type {
  CtiResult,
  CtiSummaryField,
  IndicatorType,
  Verdict,
} from "@/background/cti-types";

const VT_BASE = "https://www.virustotal.com/api/v3";
const REQUEST_TIMEOUT_MS = 240_000;

interface VtAnalysisStats {
  malicious?: number;
  suspicious?: number;
  harmless?: number;
  undetected?: number;
  timeout?: number;
}

interface VtAttributes {
  last_analysis_stats?: VtAnalysisStats;
  reputation?: number;
  country?: string;
  as_owner?: string;
  asn?: number;
  last_modification_date?: number;
  last_analysis_date?: number;
  meaningful_name?: string;
  type_description?: string;
}

interface VtResponseBody {
  data?: { attributes?: VtAttributes };
}

function base64UrlEncode(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function vtPathFor(indicator: string, type: IndicatorType): string {
  switch (type) {
    case "ip":
      return `/ip_addresses/${encodeURIComponent(indicator)}`;
    case "domain":
      return `/domains/${encodeURIComponent(indicator)}`;
    case "hash":
      return `/files/${encodeURIComponent(indicator)}`;
    case "url":
      return `/urls/${base64UrlEncode(indicator)}`;
  }
}

function deriveVerdict(stats: VtAnalysisStats | undefined): Verdict {
  if (!stats) return "unknown";
  const malicious = stats.malicious ?? 0;
  const suspicious = stats.suspicious ?? 0;
  const harmless = stats.harmless ?? 0;
  const undetected = stats.undetected ?? 0;
  if (malicious > 0) return "malicious";
  if (suspicious > 0) return "suspicious";
  if (harmless + undetected > 0) return "clean";
  return "unknown";
}

function isoDate(epochSeconds: number | undefined): string | undefined {
  if (epochSeconds === undefined) return undefined;
  return new Date(epochSeconds * 1000).toISOString();
}

export function buildVirusTotalSummary(
  attrs: VtAttributes | undefined,
  type: IndicatorType,
): CtiSummaryField[] {
  const summary: CtiSummaryField[] = [];
  const stats = attrs?.last_analysis_stats;
  if (stats) {
    const total =
      (stats.malicious ?? 0) +
      (stats.suspicious ?? 0) +
      (stats.harmless ?? 0) +
      (stats.undetected ?? 0) +
      (stats.timeout ?? 0);
    summary.push({
      label: "Malicious engines",
      value: `${stats.malicious ?? 0} / ${total}`,
    });
    summary.push({
      label: "Suspicious",
      value: String(stats.suspicious ?? 0),
    });
    summary.push({ label: "Harmless", value: String(stats.harmless ?? 0) });
    summary.push({
      label: "Undetected",
      value: String(stats.undetected ?? 0),
    });
  }
  if (typeof attrs?.reputation === "number") {
    summary.push({ label: "Reputation", value: String(attrs.reputation) });
  }
  if (type === "ip") {
    if (attrs?.country) {
      summary.push({ label: "Country", value: attrs.country });
    }
    if (attrs?.as_owner) {
      summary.push({ label: "AS owner", value: attrs.as_owner });
    }
    if (typeof attrs?.asn === "number") {
      summary.push({ label: "ASN", value: String(attrs.asn) });
    }
  }
  if (type === "hash") {
    if (attrs?.meaningful_name) {
      summary.push({ label: "Name", value: attrs.meaningful_name });
    }
    if (attrs?.type_description) {
      summary.push({ label: "Type", value: attrs.type_description });
    }
  }
  const lastAnalysis = isoDate(attrs?.last_analysis_date);
  if (lastAnalysis) {
    summary.push({ label: "Last analysis", value: lastAnalysis });
  }
  const lastModified = isoDate(attrs?.last_modification_date);
  if (lastModified) {
    summary.push({ label: "Last modification", value: lastModified });
  }
  return summary;
}

export function mapVirusTotalResponse(
  body: VtResponseBody,
  indicatorType: IndicatorType,
): { verdict: Verdict; summary: CtiSummaryField[] } {
  const attrs = body.data?.attributes;
  return {
    verdict: deriveVerdict(attrs?.last_analysis_stats),
    summary: buildVirusTotalSummary(attrs, indicatorType),
  };
}

export async function lookupVirusTotal(args: {
  indicator: string;
  indicatorType: IndicatorType;
  query: string;
  ttlHours: number;
}): Promise<CtiResult> {
  const apiKey = await getApiKey("virustotal");
  if (!apiKey) {
    throw new Error("VirusTotal API key is not configured");
  }

  const url = `${VT_BASE}${vtPathFor(args.indicator, args.indicatorType)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await withKeepalive(() =>
      fetch(url, {
        method: "GET",
        headers: { "x-apikey": apiKey },
        signal: controller.signal,
      }),
    );
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("VirusTotal: request timed out after 4 minutes");
    }
    throw new Error(
      `VirusTotal: network error${err instanceof Error ? ` (${err.message})` : ""}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const timestamp = Date.now();
  const staleAfter = timestamp + args.ttlHours * 3_600_000;
  const canonicalIndicator = args.indicator.trim().toLowerCase();

  if (response.status === 404) {
    return {
      provider: "virustotal",
      indicatorType: args.indicatorType,
      indicator: canonicalIndicator,
      query: args.query,
      timestamp,
      staleAfter,
      verdict: "unknown",
      summary: [{ label: "Status", value: "Not found in VirusTotal" }],
      response: null,
    };
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("VirusTotal: invalid or unauthorized API key");
  }
  if (response.status === 429) {
    throw new Error("VirusTotal: rate limit (429). Try again later.");
  }
  if (response.status >= 500) {
    throw new Error(`VirusTotal: provider error (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`VirusTotal: unexpected response (${response.status})`);
  }

  let body: VtResponseBody;
  try {
    body = (await response.json()) as VtResponseBody;
  } catch {
    throw new Error("VirusTotal: failed to parse response body");
  }

  const { verdict, summary } = mapVirusTotalResponse(body, args.indicatorType);
  return {
    provider: "virustotal",
    indicatorType: args.indicatorType,
    indicator: canonicalIndicator,
    query: args.query,
    timestamp,
    staleAfter,
    verdict,
    summary,
    response: body,
  };
}
