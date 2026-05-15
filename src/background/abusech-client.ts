// abuse.ch ThreatFox client. See TECHNICAL_DESIGN.md §6.
// Two modes: "web" (no auth) and "api" (Auth-Key header). Mode is chosen by
// the user in Settings; UI passes the resolved mode through to here.

import { withKeepalive } from "@/background/keepalive";
import { REQUEST_TIMEOUT_MS } from "@/background/ai-adapters/shared/http";
import type {
  CtiResult,
  CtiSummaryField,
  IndicatorType,
  Verdict,
} from "@/background/cti-types";
import type { AbusechMode } from "@/storage/types";

const THREATFOX_URL = "https://threatfox-api.abuse.ch/api/v1/";

interface ThreatFoxIoc {
  id?: string | number;
  ioc?: string;
  ioc_type?: string;
  threat_type?: string;
  malware?: string;
  malware_printable?: string;
  malware_alias?: string | null;
  confidence_level?: number;
  first_seen?: string | null;
  last_seen?: string | null;
  reporter?: string;
  reference?: string | null;
  tags?: string[] | null;
}

interface ThreatFoxResponseBody {
  query_status?: string;
  data?: ThreatFoxIoc[];
}

function deriveVerdict(body: ThreatFoxResponseBody): Verdict {
  const status = body.query_status;
  if (status === "ok" && Array.isArray(body.data) && body.data.length > 0) {
    return "malicious";
  }
  if (status === "no_result") return "clean";
  return "unknown";
}

export function buildAbusechSummary(
  body: ThreatFoxResponseBody,
): CtiSummaryField[] {
  const summary: CtiSummaryField[] = [];
  const status = body.query_status ?? "unknown";
  summary.push({ label: "ThreatFox status", value: status });

  const data = Array.isArray(body.data) ? body.data : [];
  if (data.length === 0) return summary;

  summary.push({ label: "Hits", value: String(data.length) });

  const first = data[0];
  if (first?.malware_printable || first?.malware) {
    summary.push({
      label: "Malware",
      value: first.malware_printable ?? first.malware ?? "",
    });
  }
  if (first?.threat_type) {
    summary.push({ label: "Threat type", value: first.threat_type });
  }
  if (typeof first?.confidence_level === "number") {
    summary.push({
      label: "Confidence",
      value: `${first.confidence_level} / 100`,
    });
  }
  if (first?.first_seen) {
    summary.push({ label: "First seen", value: first.first_seen });
  }
  if (first?.last_seen) {
    summary.push({ label: "Last seen", value: first.last_seen });
  }
  return summary;
}

export function mapAbusechResponse(body: ThreatFoxResponseBody): {
  verdict: Verdict;
  summary: CtiSummaryField[];
} {
  return {
    verdict: deriveVerdict(body),
    summary: buildAbusechSummary(body),
  };
}

export async function lookupAbusech(args: {
  indicator: string;
  indicatorType: IndicatorType;
  query: string;
  ttlHours: number;
  mode: AbusechMode;
  apiKey: string | undefined;
}): Promise<CtiResult> {
  if (args.mode === "api" && !args.apiKey) {
    throw new Error("abuse.ch API mode selected but no API key configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (args.mode === "api" && args.apiKey) {
    headers["Auth-Key"] = args.apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await withKeepalive(() =>
      fetch(THREATFOX_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: "search_ioc",
          search_term: args.indicator,
        }),
        signal: controller.signal,
      }),
    );
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("abuse.ch: request timed out after 4 minutes");
    }
    throw new Error(
      `abuse.ch: network error${err instanceof Error ? ` (${err.message})` : ""}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const timestamp = Date.now();
  const staleAfter = timestamp + args.ttlHours * 3_600_000;
  const canonicalIndicator = args.indicator.trim().toLowerCase();

  if (response.status === 401 || response.status === 403) {
    throw new Error("abuse.ch: invalid or unauthorized API key");
  }
  if (response.status === 429) {
    throw new Error("abuse.ch: rate limit (429). Try again later.");
  }
  if (response.status >= 500) {
    throw new Error(`abuse.ch: provider error (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`abuse.ch: unexpected response (${response.status})`);
  }

  let body: ThreatFoxResponseBody;
  try {
    body = (await response.json()) as ThreatFoxResponseBody;
  } catch {
    throw new Error("abuse.ch: failed to parse response body");
  }

  const { verdict, summary } = mapAbusechResponse(body);
  return {
    provider: "abusech",
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
