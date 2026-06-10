import { describe, expect, it } from "vitest";
import type {
  CtiHistoryEntry,
  ProviderResult,
  Verdict,
} from "../../../src/background/cti-types";
import { buildHistoryCsv } from "../../../src/modules/cti/csv";

function slot(verdict: Verdict): ProviderResult {
  return { verdict, summary: [], response: null, lookedUpAt: 0, staleAfter: 0 };
}

function entryWith(
  indicator: string,
  providers: CtiHistoryEntry["providers"] = {},
): CtiHistoryEntry {
  return {
    indicator,
    indicatorType: "ip",
    query: indicator,
    firstLookupAt: 0,
    lastLookupAt: 0,
    providers,
  };
}

describe("buildHistoryCsv", () => {
  it("emits the header row and nothing else for no entries", () => {
    expect(buildHistoryCsv([])).toBe(
      "indicator,indicatorType,firstLookupAt,lastLookupAt," +
        "virustotal_verdict,virustotal_lookedUpAt," +
        "abuseipdb_verdict,abuseipdb_lookedUpAt," +
        "abusech_verdict,abusech_lookedUpAt",
    );
  });

  it("renders provider verdicts and leaves missing slots blank", () => {
    const csv = buildHistoryCsv([
      entryWith("1.1.1.1", { virustotal: slot("malicious") }),
    ]);
    expect(csv.split("\n")[1]).toBe(
      "1.1.1.1,ip,1970-01-01T00:00:00.000Z,1970-01-01T00:00:00.000Z," +
        "malicious,1970-01-01T00:00:00.000Z,,,,",
    );
  });

  it("quotes and escapes fields containing comma, quote, or newline", () => {
    const csv = buildHistoryCsv([entryWith('a,"b"\nc')]);
    expect(csv.includes('"a,""b""\nc"')).toBe(true);
  });

  // CSV / formula injection: a cell beginning with = + - @ (or a leading
  // tab/CR that lets one of those become the first glyph) is executed as a
  // formula by Excel/LibreOffice/Sheets on open. The indicator field is
  // attacker-influenced, so the export must neutralize these.
  it.each([
    ["=1+1", "'=1+1"],
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "'\rcmd"],
  ])("neutralizes formula-leading indicator %j", (indicator, expected) => {
    const row = buildHistoryCsv([entryWith(indicator)]).split("\n")[1];
    expect(row.startsWith(`${expected},`)).toBe(true);
  });

  it("neutralizes a formula and still quotes it when it holds a comma", () => {
    const csv = buildHistoryCsv([entryWith("=2+5,6")]);
    expect(csv.includes('"\'=2+5,6"')).toBe(true);
  });

  it("leaves a benign indicator untouched", () => {
    const row = buildHistoryCsv([entryWith("evil.example.com")]).split("\n")[1];
    expect(row.startsWith("evil.example.com,")).toBe(true);
  });
});
