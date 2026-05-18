import { describe, expect, it } from "vitest";
import { applyLanguageDirective, FRENCH_DIRECTIVE } from "../../../src/background/ai-language";

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
    expect(out).toBe(SYSTEM + FRENCH_DIRECTIVE);
    expect(FRENCH_DIRECTIVE.startsWith("\n\n")).toBe(true);
    expect(FRENCH_DIRECTIVE).toContain("Write your entire response in French");
    expect(FRENCH_DIRECTIVE).toContain("Do NOT translate technical or ambiguous terms");
    expect(FRENCH_DIRECTIVE).toContain("IoCs");
  });
});
