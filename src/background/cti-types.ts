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

// Persisted history shape: one entry per indicator, providers nested.
// See TECHNICAL_DESIGN.md §6.

export interface ProviderResult {
  verdict: Verdict;
  summary: CtiSummaryField[];
  response: unknown;
  lookedUpAt: number;
  staleAfter: number;
  error?: { kind: string; message: string };
}

export interface CtiHistoryEntry {
  indicator: string;
  indicatorType: IndicatorType;
  query: string;
  firstLookupAt: number;
  lastLookupAt: number;
  providers: Partial<Record<CtiProvider, ProviderResult>>;
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
