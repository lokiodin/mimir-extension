// AbuseIPDB v2 client. See TECHNICAL_DESIGN.md §6.
// IPv4/IPv6 only. Uses /api/v2/check.

import { getApiKey } from "@/storage/manager";
import { withKeepalive } from "@/background/keepalive";
import { REQUEST_TIMEOUT_MS } from "@/background/ai-adapters/shared/http";
import { canonicalizeIndicator } from "@/background/cti-types";
import type {
  CtiResult,
  CtiSummaryField,
  IndicatorType,
  Verdict,
} from "@/background/cti-types";

const ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2";
const DEFAULT_MAX_AGE_DAYS = 90;

interface AbuseIPDBData {
  ipAddress?: string;
  isPublic?: boolean;
  ipVersion?: number;
  isWhitelisted?: boolean | null;
  abuseConfidenceScore?: number;
  countryCode?: string | null;
  usageType?: string | null;
  isp?: string;
  domain?: string | null;
  totalReports?: number;
  numDistinctUsers?: number;
  lastReportedAt?: string | null;
}

interface AbuseIPDBResponseBody {
  data?: AbuseIPDBData;
}

function deriveVerdict(data: AbuseIPDBData | undefined): Verdict {
  if (!data) return "unknown";
  const score = data.abuseConfidenceScore ?? 0;
  const reports = data.totalReports ?? 0;
  if (score >= 75) return "malicious";
  if (score >= 25) return "suspicious";
  if (data.isWhitelisted === true && score <= 5) return "clean";
  if (reports === 0 && score === 0) return "clean";
  return "unknown";
}

export function buildAbuseIPDBSummary(
  data: AbuseIPDBData | undefined,
): CtiSummaryField[] {
  const summary: CtiSummaryField[] = [];
  if (!data) return summary;
  if (typeof data.abuseConfidenceScore === "number") {
    summary.push({
      label: "Abuse confidence",
      value: `${data.abuseConfidenceScore} / 100`,
    });
  }
  if (typeof data.totalReports === "number") {
    summary.push({ label: "Total reports", value: String(data.totalReports) });
  }
  if (typeof data.numDistinctUsers === "number") {
    summary.push({
      label: "Distinct reporters",
      value: String(data.numDistinctUsers),
    });
  }
  if (data.countryCode) {
    summary.push({ label: "Country", value: data.countryCode });
  }
  if (data.usageType) {
    summary.push({ label: "Usage type", value: data.usageType });
  }
  if (data.isp) {
    summary.push({ label: "ISP", value: data.isp });
  }
  if (data.domain) {
    summary.push({ label: "Domain", value: data.domain });
  }
  if (data.isWhitelisted === true) {
    summary.push({ label: "Whitelisted", value: "yes" });
  }
  if (data.lastReportedAt) {
    summary.push({ label: "Last reported", value: data.lastReportedAt });
  }
  return summary;
}

export function mapAbuseIPDBResponse(body: AbuseIPDBResponseBody): {
  verdict: Verdict;
  summary: CtiSummaryField[];
} {
  const data = body.data;
  return {
    verdict: deriveVerdict(data),
    summary: buildAbuseIPDBSummary(data),
  };
}

export async function lookupAbuseIPDB(args: {
  indicator: string;
  indicatorType: IndicatorType;
  query: string;
  ttlHours: number;
}): Promise<CtiResult> {
  if (args.indicatorType !== "ip") {
    throw new Error("AbuseIPDB only supports IPs");
  }

  const apiKey = await getApiKey("abuseipdb");
  if (!apiKey) {
    throw new Error("AbuseIPDB API key is not configured");
  }

  const url = `${ABUSEIPDB_BASE}/check?ipAddress=${encodeURIComponent(
    args.indicator,
  )}&maxAgeInDays=${DEFAULT_MAX_AGE_DAYS}&verbose`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await withKeepalive(() =>
      fetch(url, {
        method: "GET",
        headers: {
          Key: apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
      }),
    );
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("AbuseIPDB: request timed out after 4 minutes");
    }
    throw new Error(
      `AbuseIPDB: network error${err instanceof Error ? ` (${err.message})` : ""}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const timestamp = Date.now();
  const staleAfter = timestamp + args.ttlHours * 3_600_000;
  const canonicalIndicator = canonicalizeIndicator(
    args.indicator,
    args.indicatorType,
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("AbuseIPDB: invalid or unauthorized API key");
  }
  if (response.status === 422) {
    return {
      provider: "abuseipdb",
      indicatorType: args.indicatorType,
      indicator: canonicalIndicator,
      query: args.query,
      timestamp,
      staleAfter,
      verdict: "unknown",
      summary: [{ label: "Status", value: "Indicator rejected by AbuseIPDB" }],
      response: null,
    };
  }
  if (response.status === 429) {
    throw new Error("AbuseIPDB: rate limit (429). Try again later.");
  }
  if (response.status >= 500) {
    throw new Error(`AbuseIPDB: provider error (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`AbuseIPDB: unexpected response (${response.status})`);
  }

  let body: AbuseIPDBResponseBody;
  try {
    body = (await response.json()) as AbuseIPDBResponseBody;
  } catch {
    throw new Error("AbuseIPDB: failed to parse response body");
  }

  const { verdict, summary } = mapAbuseIPDBResponse(body);
  return {
    provider: "abuseipdb",
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
