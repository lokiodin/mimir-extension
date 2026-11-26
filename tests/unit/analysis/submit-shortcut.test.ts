import { describe, expect, it } from "vitest";
import {
  isMacPlatform,
  isSubmitShortcut,
  submitShortcutLabel,
} from "../../../src/modules/analysis/submit-shortcut";

describe("isMacPlatform", () => {
  it("prefers userAgentData.platform", () => {
    expect(isMacPlatform({ userAgentData: { platform: "macOS" } })).toBe(true);
    expect(isMacPlatform({ userAgentData: { platform: "Windows" } })).toBe(
      false,
    );
  });

  it("falls back to navigator.platform (Firefox)", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "Linux x86_64" })).toBe(false);
    expect(isMacPlatform({ platform: "Win32" })).toBe(false);
  });

  it("defaults to macOS when unknown", () => {
    expect(isMacPlatform(undefined)).toBe(true);
    expect(isMacPlatform({})).toBe(true);
  });
});

describe("submitShortcutLabel", () => {
  it("returns the platform hint", () => {
    expect(submitShortcutLabel(true)).toBe("⌘↵");
    expect(submitShortcutLabel(false)).toBe("Ctrl+↵");
  });
});

describe("isSubmitShortcut", () => {
  const base = { key: "Enter", metaKey: false, ctrlKey: false };

  it("matches Cmd+Enter and Ctrl+Enter", () => {
    expect(isSubmitShortcut({ ...base, metaKey: true })).toBe(true);
    expect(isSubmitShortcut({ ...base, ctrlKey: true })).toBe(true);
  });

  it("ignores plain Enter and other keys", () => {
    expect(isSubmitShortcut(base)).toBe(false);
    expect(isSubmitShortcut({ ...base, key: "a", metaKey: true })).toBe(false);
  });
});
