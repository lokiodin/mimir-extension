import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runStage1 } from "@/redaction/pipeline";

// Per-case JSON shape. `expected` lists the detections Stage 1 should
// produce for the input; `type` and `original` carry; `start`/`end` are
// authoritative.
export interface CorpusCase {
  id: string;
  source: "synthesized" | "ctf-public" | "ir-public" | "synthetic-test";
  input: string;
  expected: Array<{
    type: string;
    start: number;
    end: number;
    original: string;
  }>;
  cite?: string;
}

export interface DetectorScore {
  detector: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number; // 0..1
  recall: number; // 0..1
  f1: number;
}

export interface CorpusReport {
  caseCount: number;
  byDetector: DetectorScore[];
  overall: DetectorScore;
}

const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), "cases");

export function loadCases(): CorpusCase[] {
  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const raw = readFileSync(join(CASES_DIR, f), "utf-8");
    return JSON.parse(raw) as CorpusCase;
  });
}

function rangesMatch(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start === b.start && a.end === b.end;
}

export function evaluate(cases: ReadonlyArray<CorpusCase>): CorpusReport {
  // Per-detector tallies.
  const tally = new Map<
    string,
    { tp: number; fp: number; fn: number }
  >();
  const ensure = (type: string) => {
    let entry = tally.get(type);
    if (!entry) {
      entry = { tp: 0, fp: 0, fn: 0 };
      tally.set(type, entry);
    }
    return entry;
  };

  for (const c of cases) {
    const got = runStage1(c.input, {}); // all detectors enabled
    const matched = new Set<number>(); // indices into c.expected
    for (const detection of got) {
      const i = c.expected.findIndex(
        (e, idx) =>
          !matched.has(idx) &&
          e.type === detection.type &&
          rangesMatch(e, detection),
      );
      if (i === -1) {
        ensure(detection.type).fp += 1;
      } else {
        matched.add(i);
        ensure(detection.type).tp += 1;
      }
    }
    for (let idx = 0; idx < c.expected.length; idx++) {
      if (!matched.has(idx)) {
        ensure(c.expected[idx].type).fn += 1;
      }
    }
  }

  const byDetector: DetectorScore[] = [];
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  for (const [detector, t] of [...tally.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const precision = safeDiv(t.tp, t.tp + t.fp);
    const recall = safeDiv(t.tp, t.tp + t.fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    byDetector.push({
      detector,
      truePositives: t.tp,
      falsePositives: t.fp,
      falseNegatives: t.fn,
      precision,
      recall,
      f1,
    });
    totalTp += t.tp;
    totalFp += t.fp;
    totalFn += t.fn;
  }

  const overallP = safeDiv(totalTp, totalTp + totalFp);
  const overallR = safeDiv(totalTp, totalTp + totalFn);
  const overall: DetectorScore = {
    detector: "overall",
    truePositives: totalTp,
    falsePositives: totalFp,
    falseNegatives: totalFn,
    precision: overallP,
    recall: overallR,
    f1: safeDiv(2 * overallP * overallR, overallP + overallR),
  };

  return { caseCount: cases.length, byDetector, overall };
}

function safeDiv(num: number, denom: number): number {
  if (denom === 0) return 0;
  return num / denom;
}

export function formatReport(report: CorpusReport): string {
  const lines: string[] = [];
  lines.push(
    `# Redaction corpus eval — ${report.caseCount} case(s)\n`,
  );
  lines.push(
    "Detector                       TP   FP   FN  Precision  Recall   F1",
  );
  lines.push(
    "-----------------------------  ---  ---  ---  ---------  -------  ------",
  );
  const fmt = (s: DetectorScore) =>
    [
      s.detector.padEnd(29),
      String(s.truePositives).padStart(3),
      String(s.falsePositives).padStart(3),
      String(s.falseNegatives).padStart(3),
      s.precision.toFixed(3).padStart(9),
      s.recall.toFixed(3).padStart(7),
      s.f1.toFixed(3).padStart(6),
    ].join("  ");
  for (const d of report.byDetector) lines.push(fmt(d));
  lines.push("");
  lines.push(fmt(report.overall));
  return lines.join("\n");
}
