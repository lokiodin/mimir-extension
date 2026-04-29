// Shared CTI types. Imported by both the service-worker client and the UI module.
// See TECHNICAL_DESIGN.md §6.

export type Verdict =
  | "malicious"
  | "suspicious"
  | "clean"
  | "unknown"
  | "error";

export type IndicatorType = "ip" | "domain" | "url" | "hash";

export type CtiProvider = "virustotal" | "abuseipdb" | "abusech";

export interface CtiSummaryField {
  label: string;
  value: string;
}

export interface CtiResult {
  provider: CtiProvider;
  indicatorType: IndicatorType;
  indicator: string;

  query: string;
  timestamp: number;
  staleAfter: number;

  verdict: Verdict;
  summary: CtiSummaryField[];
  response: unknown;
}

export interface CtiLookupRequest {
  type: "cti.lookup";
  provider: CtiProvider;
  indicatorType: IndicatorType;
  indicator: string;
  query: string;
}

export type CtiLookupResponse =
  | { ok: true; result: CtiResult }
  | { ok: false; error: string };
