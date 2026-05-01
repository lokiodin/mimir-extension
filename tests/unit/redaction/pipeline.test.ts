import { describe, it, expect } from "vitest";
import {
  runStage1,
  runStage2,
  mergeManual,
  applyRedactions,
} from "@/redaction/pipeline";
import { createPlaceholderState } from "@/redaction/types";
import type {
  AiCompleteRequest,
  AiCompleteResponse,
} from "@/background/ai-types";

describe("Stage 1 pipeline", () => {
  it("redacts a mixed-content sample with stable placeholders", () => {
    const text =
      "From alice@example.com at 10.0.0.1 to 10.0.0.1 again, also bob@example.com.";
    const detections = runStage1(text, {});
    const placeholders = Object.fromEntries(
      detections.map((d) => [d.original, d.placeholder]),
    );
    expect(placeholders["alice@example.com"]).toBe("EMAIL_1");
    expect(placeholders["bob@example.com"]).toBe("EMAIL_2");
    // Same IP appearing twice gets the same placeholder.
    expect(placeholders["10.0.0.1"]).toBe("IP_1");
    const ipDetections = detections.filter((d) => d.original === "10.0.0.1");
    expect(ipDetections).toHaveLength(2);
    expect(ipDetections.every((d) => d.placeholder === "IP_1")).toBe(true);
  });

  it("drops a lower-priority detection that overlaps a higher-priority one", () => {
    // Email runs before FQDN. The email's domain should not be re-flagged
    // as an FQDN.
    const text = "Mail alice@example.com please.";
    const detections = runStage1(text, {});
    expect(detections.filter((d) => d.type === "email")).toHaveLength(1);
    expect(detections.filter((d) => d.type === "fqdn")).toHaveLength(0);
  });

  it("respects per-detector toggles", () => {
    const text = "Visit example.com and email alice@example.com.";
    const detections = runStage1(text, { fqdn: false, email: false });
    expect(detections).toHaveLength(0);
  });

  it("private key block shadows tokens that would appear inside it", () => {
    const text = `before
-----BEGIN PRIVATE KEY-----
AKIAIOSFODNN7EXAMPLE
-----END PRIVATE KEY-----
after`;
    const detections = runStage1(text, {});
    expect(detections.filter((d) => d.type === "aws access key")).toHaveLength(
      0,
    );
    expect(detections.filter((d) => d.type === "private key block"))
      .toHaveLength(1);
  });

  it("assigns numbered placeholders by appearance order, not detector order", () => {
    const text = "10.0.0.1 then 10.0.0.2 then 10.0.0.1 again";
    const detections = runStage1(text, {});
    const ip1 = detections.find((d) => d.original === "10.0.0.1");
    const ip2 = detections.find((d) => d.original === "10.0.0.2");
    expect(ip1?.placeholder).toBe("IP_1");
    expect(ip2?.placeholder).toBe("IP_2");
  });
});

describe("applyRedactions", () => {
  it("replaces every accepted detection with its placeholder", () => {
    const text = "Mail alice@example.com on 10.0.0.1.";
    const detections = runStage1(text, {});
    const out = applyRedactions(text, detections);
    expect(out).toBe("Mail EMAIL_1 on IP_1.");
  });

  it("leaves rejected detections in the original text", () => {
    const text = "Mail alice@example.com on 10.0.0.1.";
    const detections = runStage1(text, {});
    const onlyEmail = detections.filter((d) => d.type === "email");
    expect(applyRedactions(text, onlyEmail)).toBe(
      "Mail EMAIL_1 on 10.0.0.1.",
    );
  });
});

describe("Stage 2 pipeline", () => {
  it("merges Stage 2 candidates that don't overlap Stage 1", async () => {
    const text = "Project Hyperion alerts at 10.0.0.1.";
    const state = createPlaceholderState();
    const stage1 = runStage1(text, {}, state);

    const stage2 = await runStage2(text, stage1, {
      providerId: "fake",
      send: async () =>
        ({
          ok: true,
          providerLabel: "test",
          providerType: "ollama",
          response: '[{"type":"internal-name","original":"Hyperion"}]',
        }) satisfies AiCompleteResponse,
    }, state);

    expect(stage2).toHaveLength(1);
    expect(stage2[0].source).toBe("stage2");
    expect(stage2[0].original).toBe("Hyperion");
    expect(stage2[0].placeholder.startsWith("INTERNAL")).toBe(true);
  });

  it("drops Stage 2 candidates overlapping a Stage 1 detection (cannot unflag)", async () => {
    const text = "Mail alice@example.com please.";
    const state = createPlaceholderState();
    const stage1 = runStage1(text, {}, state);

    const stage2 = await runStage2(text, stage1, {
      providerId: "fake",
      send: async () =>
        ({
          ok: true,
          providerLabel: "test",
          providerType: "ollama",
          response: '[{"type":"name","original":"alice@example.com"}]',
        }) satisfies AiCompleteResponse,
    }, state);

    expect(stage2).toHaveLength(0);
  });

  it("returns [] on AI failure without throwing", async () => {
    const stage2 = await runStage2(
      "anything",
      [],
      {
        providerId: "fake",
        send: async () => ({ ok: false, error: "unreachable" }),
      },
      createPlaceholderState(),
    );
    expect(stage2).toEqual([]);
  });

  it("returns [] on malformed JSON", async () => {
    const stage2 = await runStage2(
      "anything",
      [],
      {
        providerId: "fake",
        send: async (_req: AiCompleteRequest) =>
          ({
            ok: true,
            providerLabel: "test",
            providerType: "ollama",
            response: "not json at all",
          }) satisfies AiCompleteResponse,
      },
      createPlaceholderState(),
    );
    expect(stage2).toEqual([]);
  });
});

describe("mergeManual", () => {
  it("redacts every occurrence of the manual substring", () => {
    const text = "Hyperion went down. Hyperion is critical.";
    const state = createPlaceholderState();
    const manual = mergeManual(text, "Hyperion", "internal-name", [], state);
    expect(manual).toHaveLength(2);
    expect(manual[0].placeholder).toBe(manual[1].placeholder);
    expect(manual[0].source).toBe("manual");
  });

  it("skips occurrences overlapping existing detections", () => {
    const text = "alice@example.com and example.com landing page";
    const state = createPlaceholderState();
    // Disable fqdn so Stage 1 only catches the email — the manual add is
    // what we want to test against the email overlap, not an fqdn overlap.
    const stage1 = runStage1(text, { fqdn: false }, state);
    const manual = mergeManual(
      text,
      "example.com",
      "domain",
      stage1,
      state,
    );
    // The "example.com" inside "alice@example.com" overlaps the email
    // detection and is skipped. The standalone landing page hit is kept.
    expect(manual).toHaveLength(1);
    expect(manual[0].start).toBe(text.indexOf("example.com landing"));
  });
});
