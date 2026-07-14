import { describe, it, expect } from "vitest";
import { evaluate, formatReport, loadCases } from "./runner";

// Informational corpus eval. Per TECHNICAL_DESIGN.md §5.5 this surfaces
// numbers without auto-failing; the assertion only confirms the runner
// completed against a non-empty corpus.

describe("redaction corpus", () => {
  it("runs Stage 1 against every case and reports precision/recall", () => {
    const cases = loadCases();
    expect(cases.length).toBeGreaterThan(0);
    const report = evaluate(cases);
    // Print to stdout so CI / dev consumers see the table.
     
    console.log("\n" + formatReport(report) + "\n");
    expect(report.caseCount).toBe(cases.length);
  });
});
