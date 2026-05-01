import { it } from "vitest";
import { runStage1 } from "@/redaction/pipeline";
import { loadCases } from "./runner";

// Skipped by default. Flip to `it(...)` locally to inspect mismatches when
// curating new corpus cases.
it.skip("debug: prints corpus mismatches", () => {
  const cases = loadCases();
  let mismatches = 0;
  for (const c of cases) {
    const got = runStage1(c.input, {});
    const expectedSet = new Set(
      c.expected.map((e) => `${e.type}@${e.start}-${e.end}`),
    );
    const gotSet = new Set(got.map((g) => `${g.type}@${g.start}-${g.end}`));
    const fps = got.filter(
      (g) => !expectedSet.has(`${g.type}@${g.start}-${g.end}`),
    );
    const fns = c.expected.filter(
      (e) => !gotSet.has(`${e.type}@${e.start}-${e.end}`),
    );
    if (fps.length > 0 || fns.length > 0) {
      mismatches++;
      // eslint-disable-next-line no-console
      console.log(`--- ${c.id} ---`);
      // eslint-disable-next-line no-console
      console.log(`input: ${JSON.stringify(c.input)}`);
      for (const fp of fps) {
        // eslint-disable-next-line no-console
        console.log(
          `  FP ${fp.type}: ${JSON.stringify(fp.original)} @${fp.start}-${fp.end}`,
        );
      }
      for (const fn of fns) {
        // eslint-disable-next-line no-console
        console.log(
          `  FN ${fn.type}: ${JSON.stringify(fn.original)} @${fn.start}-${fn.end}`,
        );
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Mismatches: ${mismatches}/${cases.length}`);
});
