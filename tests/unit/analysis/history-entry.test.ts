import { describe, expect, it } from "vitest";
import { buildAnalysisEntry } from "../../../src/modules/analysis/history";

describe("buildAnalysisEntry", () => {
  it("records a successful completion with the SW-resolved provider label", () => {
    const entry = buildAnalysisEntry(
      "sshd: Failed password",
      {
        ok: true,
        response: "## Summary",
        providerLabel: "Local (ollama · llama3)",
        providerType: "ollama",
      },
      { label: "Local", type: "ollama" },
    );
    expect(entry.input).toBe("sshd: Failed password");
    expect(entry.response).toBe("## Summary");
    expect(entry.providerLabel).toBe("Local (ollama · llama3)");
    expect(entry.providerType).toBe("ollama");
    expect(entry.error).toBeUndefined();
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.timestamp).toBe("number");
  });

  it("records a failed completion as an error entry", () => {
    const entry = buildAnalysisEntry(
      "sshd: Failed password",
      { ok: false, error: "Ollama: 403" },
      { label: "Local", type: "ollama" },
    );
    expect(entry.error).toBe(true);
    expect(entry.response).toBe("Ollama: 403");
    expect(entry.providerLabel).toBe("Local");
    expect(entry.providerType).toBe("ollama");
  });

  it("falls back when the provider is unknown", () => {
    const entry = buildAnalysisEntry(
      "x",
      { ok: false, error: "Provider not configured" },
      undefined,
    );
    expect(entry.error).toBe(true);
    expect(entry.providerLabel).toBe("(unknown)");
  });

  it("gives each entry a distinct id", () => {
    const fail = { ok: false as const, error: "e" };
    const a = buildAnalysisEntry("x", fail, undefined);
    const b = buildAnalysisEntry("x", fail, undefined);
    expect(a.id).not.toBe(b.id);
  });
});
