// Redaction pipeline types. See TECHNICAL_DESIGN.md §5.

export type DetectionSource = "stage1" | "stage2" | "manual";

export interface Detection {
  type: string; // detector id, e.g. "ipv4", "email"
  start: number; // inclusive offset in original text
  end: number; // exclusive
  original: string; // matched substring
  placeholder: string; // e.g. "IP_1", "EMAIL_2"
  confidence: number; // 0..1
  source: DetectionSource;
}

export type Detector = (text: string) => DetectorHit[];

// Raw output from a detector, before placeholder assignment.
export interface DetectorHit {
  type: string;
  start: number;
  end: number;
  original: string;
  confidence?: number; // overrides defaultConfidence if provided
}

export interface DetectorMeta {
  id: string; // matches the lowercased settings key, e.g. "ipv4"
  label: string; // display label shown in settings, e.g. "IPv4"
  detect: Detector;
  priority: number; // 1 = highest (private key), 12 = lowest (uuid/entropy)
  defaultConfidence: number;
  // Maps the detector id to a placeholder family. Most detectors map 1:1
  // (e.g. "ipv4" -> "IP"); some collapse (e.g. "ipv4" + "ipv6" -> "IP").
  placeholderPrefix: string;
}

// Session-scoped placeholder state. The same `${type}:${original}` always
// receives the same placeholder string within a session, so downstream
// consumers can reason about relationships between redactions.
export interface PlaceholderState {
  byKey: Map<string, string>;
  counters: Map<string, number>;
}

export function createPlaceholderState(): PlaceholderState {
  return { byKey: new Map(), counters: new Map() };
}

export function assignPlaceholder(
  state: PlaceholderState,
  prefix: string,
  original: string,
): string {
  const key = `${prefix}:${original}`;
  const existing = state.byKey.get(key);
  if (existing !== undefined) return existing;
  const next = (state.counters.get(prefix) ?? 0) + 1;
  state.counters.set(prefix, next);
  const placeholder = `${prefix}_${next}`;
  state.byKey.set(key, placeholder);
  return placeholder;
}
