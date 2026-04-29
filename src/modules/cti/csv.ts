import type { CtiResult } from "@/background/cti-types";

const COLUMNS: ReadonlyArray<string> = [
  "timestamp",
  "provider",
  "indicatorType",
  "indicator",
  "query",
  "verdict",
  "summary",
];

function escapeCell(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function summaryToString(entry: CtiResult): string {
  return entry.summary.map((s) => `${s.label}=${s.value}`).join("; ");
}

function rowFor(entry: CtiResult): string[] {
  return [
    new Date(entry.timestamp).toISOString(),
    entry.provider,
    entry.indicatorType,
    entry.indicator,
    entry.query,
    entry.verdict,
    summaryToString(entry),
  ];
}

export function buildHistoryCsv(entries: ReadonlyArray<CtiResult>): string {
  const lines: string[] = [COLUMNS.join(",")];
  for (const entry of entries) {
    lines.push(rowFor(entry).map(escapeCell).join(","));
  }
  return lines.join("\n");
}

export function exportHistoryAsCsv(entries: ReadonlyArray<CtiResult>): void {
  const csv = buildHistoryCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mimir-cti-history-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
