import { DETECTORS, getDetector } from "./detectors";
import {
  assignPlaceholder,
  createPlaceholderState,
  type Detection,
  type DetectorMeta,
  type PlaceholderState,
} from "./types";
import type {
  AiCompleteRequest,
  AiCompleteResponse,
} from "@/background/ai-types";

// Stage 1: deterministic detectors. See TECHNICAL_DESIGN.md §5.2.
//
// Walks the registry in priority order. For each enabled detector, runs it
// over the full text. Collects detections, then merges by descending
// priority — a later (lower-priority) detection that overlaps an earlier
// one is dropped. Stable placeholders are assigned via `state` so the same
// `original` always gets the same placeholder for the session.

export function runStage1(
  text: string,
  enabled: Record<string, boolean>,
  state: PlaceholderState = createPlaceholderState(),
): Detection[] {
  const claimed: Array<{ start: number; end: number }> = [];
  const detections: Detection[] = [];

  for (const detector of DETECTORS) {
    if (!isDetectorEnabled(detector, enabled)) continue;
    const hits = detector.detect(text);
    for (const hit of hits) {
      if (overlapsAny(hit, claimed)) continue;
      claimed.push({ start: hit.start, end: hit.end });
      const placeholder = assignPlaceholder(
        state,
        detector.placeholderPrefix,
        hit.original,
      );
      detections.push({
        type: hit.type,
        start: hit.start,
        end: hit.end,
        original: hit.original,
        placeholder,
        confidence: hit.confidence ?? detector.defaultConfidence,
        source: "stage1",
      });
    }
  }

  detections.sort((a, b) => a.start - b.start);
  return detections;
}

function isDetectorEnabled(
  detector: DetectorMeta,
  enabled: Record<string, boolean>,
): boolean {
  // Toggles default to ON when not yet present in the user's settings.
  return enabled[detector.id] ?? true;
}

function overlapsAny(
  hit: { start: number; end: number },
  ranges: ReadonlyArray<{ start: number; end: number }>,
): boolean {
  return ranges.some((r) => hit.start < r.end && r.start < hit.end);
}

// Stage 2: optional AI enrichment. See TECHNICAL_DESIGN.md §5.3.
//
// Sends the original text plus the Stage 1 detection list to the configured
// AI provider. Expects a JSON array of additional candidates the model
// noticed (internal codenames, contextual PII, etc.). Stage 1 detections
// are NEVER unflagged — any returned candidate that overlaps a Stage 1
// detection is dropped silently. On any AI/parse failure, returns [] so
// the user can proceed with Stage 1 results only.

export interface RunStage2Options {
  providerId: string;
  // Override the message-sender for testing without mocking the whole
  // chrome.runtime API surface.
  send?: (req: AiCompleteRequest) => Promise<AiCompleteResponse | undefined>;
}

interface Stage2RawCandidate {
  type?: unknown;
  original?: unknown;
  placeholder?: unknown;
}

export async function runStage2(
  text: string,
  stage1: ReadonlyArray<Detection>,
  options: RunStage2Options,
  state: PlaceholderState,
): Promise<Detection[]> {
  const send = options.send ?? defaultSendComplete;
  const userInput = JSON.stringify({
    text,
    stage1Detections: stage1.map((d) => ({
      type: d.type,
      start: d.start,
      end: d.end,
      placeholder: d.placeholder,
    })),
  });

  let response: AiCompleteResponse | undefined;
  try {
    response = await send({
      type: "ai.complete",
      providerId: options.providerId,
      featureId: "redaction-ai",
      userInput,
    });
  } catch {
    return [];
  }

  if (!response || !response.ok) return [];

  const raw = parseStage2Response(response.response);
  if (raw === null) return [];

  const out: Detection[] = [];
  const claimed = stage1.map((d) => ({ start: d.start, end: d.end }));

  for (const candidate of raw) {
    if (!isPlausibleCandidate(candidate)) continue;
    const original = String(candidate.original);
    const type = String(candidate.type);
    const found = findOccurrence(text, original, claimed);
    if (found === null) continue;
    if (overlapsAny(found, claimed)) continue;

    claimed.push(found);
    const prefix = inferPlaceholderPrefix(type);
    const placeholder = assignPlaceholder(state, prefix, original);
    out.push({
      type,
      start: found.start,
      end: found.end,
      original,
      placeholder,
      confidence: 0.5,
      source: "stage2",
    });
  }

  return out;
}

async function defaultSendComplete(
  req: AiCompleteRequest,
): Promise<AiCompleteResponse | undefined> {
  return chrome.runtime.sendMessage(req) as Promise<
    AiCompleteResponse | undefined
  >;
}

function parseStage2Response(raw: string): Stage2RawCandidate[] | null {
  // Tolerate a leading code fence or surrounding prose by extracting the
  // first JSON array we can find.
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed as Stage2RawCandidate[];
  } catch {
    return null;
  }
}

function isPlausibleCandidate(c: Stage2RawCandidate): boolean {
  return (
    typeof c.type === "string" &&
    c.type.length > 0 &&
    typeof c.original === "string" &&
    c.original.length > 0
  );
}

function findOccurrence(
  text: string,
  needle: string,
  claimed: ReadonlyArray<{ start: number; end: number }>,
): { start: number; end: number } | null {
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) return null;
    const range = { start: idx, end: idx + needle.length };
    if (!overlapsAny(range, claimed)) return range;
    from = idx + 1;
  }
}

function inferPlaceholderPrefix(type: string): string {
  const known = getDetector(type);
  if (known) return known.placeholderPrefix;
  // For Stage 2's free-form "type" strings, normalize to an upper-snake
  // family name. Falls back to "REDACTED" if the type is empty after
  // sanitizing.
  const cleaned = type
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "REDACTED";
}

// Manual additions from the user. Treats every occurrence of `needle` in
// the original text as a separate detection so substrings like an internal
// project name redact globally with one click.

export function mergeManual(
  text: string,
  needle: string,
  type: string,
  existing: ReadonlyArray<Detection>,
  state: PlaceholderState,
): Detection[] {
  if (needle.length === 0) return [];
  const claimed = existing.map((d) => ({ start: d.start, end: d.end }));
  const additions: Detection[] = [];
  const prefix = inferPlaceholderPrefix(type);
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    const range = { start: idx, end: idx + needle.length };
    from = range.end;
    if (overlapsAny(range, claimed)) continue;
    claimed.push(range);
    additions.push({
      type,
      start: range.start,
      end: range.end,
      original: needle,
      placeholder: assignPlaceholder(state, prefix, needle),
      confidence: 1.0,
      source: "manual",
    });
  }
  return additions;
}

// Apply accepted detections to the original text, replacing each range
// with its placeholder. Walks the ranges descending by `start` so earlier
// indices stay valid as later ones are mutated.

export function applyRedactions(
  text: string,
  detections: ReadonlyArray<Detection>,
): string {
  const sorted = [...detections].sort((a, b) => b.start - a.start);
  let out = text;
  for (const d of sorted) {
    out = out.slice(0, d.start) + d.placeholder + out.slice(d.end);
  }
  return out;
}
