import type {
  CtiHistoryEntry,
  CtiProvider,
} from "@/background/cti-types";

const PROVIDERS: ReadonlyArray<CtiProvider> = [
  "virustotal",
  "abuseipdb",
  "abusech",
];

const COLUMNS: ReadonlyArray<string> = [
  "indicator",
  "indicatorType",
  "firstLookupAt",
  "lastLookupAt",
  ...PROVIDERS.flatMap((p) => [`${p}_verdict`, `${p}_lookedUpAt`]),
];

function escapeCell(value: string): string {
  // Neutralize CSV/formula injection: a cell beginning with = + - @ (or a
  // leading tab/CR that lets one become the first glyph) is executed as a
  // formula by Excel/LibreOffice/Sheets on open. Indicators are attacker-
  // influenced, so prefix a single quote to force literal text, then apply
  // RFC-4180 quoting.
  const cell = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (cell.includes('"') || cell.includes(",") || cell.includes("\n")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function rowFor(entry: CtiHistoryEntry): string[] {
  const cells: string[] = [
    entry.indicator,
    entry.indicatorType,
    new Date(entry.firstLookupAt).toISOString(),
    new Date(entry.lastLookupAt).toISOString(),
  ];
  for (const provider of PROVIDERS) {
    const slot = entry.providers[provider];
    if (!slot) {
      cells.push("", "");
      continue;
    }
    cells.push(slot.verdict);
    cells.push(new Date(slot.lookedUpAt).toISOString());
  }
  return cells;
}

export function buildHistoryCsv(
  entries: ReadonlyArray<CtiHistoryEntry>,
): string {
  const lines: string[] = [COLUMNS.join(",")];
  for (const entry of entries) {
    lines.push(rowFor(entry).map(escapeCell).join(","));
  }
  return lines.join("\n");
}

export function exportHistoryAsCsv(
  entries: ReadonlyArray<CtiHistoryEntry>,
): void {
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
