import { describe, expect, it } from "vitest";
import { resolveAnalysisLanguage } from "../../../src/modules/analysis/language";
import { DEFAULT_SETTINGS } from "../../../src/storage/types";
import type { Settings } from "../../../src/storage/types";

describe("resolveAnalysisLanguage", () => {
  it("defaults to English when the field is absent", () => {
    expect(resolveAnalysisLanguage(DEFAULT_SETTINGS)).toBe("en");
  });

  it("returns the stored value when set to French", () => {
    const s: Settings = { ...DEFAULT_SETTINGS, logAnalysisLanguage: "fr" };
    expect(resolveAnalysisLanguage(s)).toBe("fr");
  });

  it("returns the stored value when set to English", () => {
    const s: Settings = { ...DEFAULT_SETTINGS, logAnalysisLanguage: "en" };
    expect(resolveAnalysisLanguage(s)).toBe("en");
  });
});
