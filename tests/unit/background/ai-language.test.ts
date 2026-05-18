import { describe, expect, it } from "vitest";
import { applyLanguageDirective } from "../../../src/background/ai-language";

const SYSTEM = "You are an analyst.";

describe("applyLanguageDirective", () => {
  it("returns the system prompt unchanged for English", () => {
    expect(applyLanguageDirective(SYSTEM, "en")).toBe(SYSTEM);
  });

  it("returns the system prompt unchanged when language is undefined", () => {
    expect(applyLanguageDirective(SYSTEM, undefined)).toBe(SYSTEM);
  });

  it("appends the French directive for French", () => {
    const out = applyLanguageDirective(SYSTEM, "fr");
    expect(out.startsWith(SYSTEM)).toBe(true);
    expect(out.length).toBeGreaterThan(SYSTEM.length);
    expect(out).toContain("Write your entire response in French");
    expect(out).toContain("Do NOT translate technical or ambiguous terms");
    expect(out).toContain("IoCs");
  });
});
