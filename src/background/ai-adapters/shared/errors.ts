// Error classification helpers. Adapters use these to map raw HTTP responses
// and fetch exceptions into the normalized AiAdapterError shape, while keeping
// user-visible message wording byte-identical to the pre-standardization code.

import type { AiAdapterError, AiAdapterErrorKind } from "../types";

export function mapHttpStatusToKind(status: number): AiAdapterErrorKind {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 429) return "rate_limited";
  return "request_failed";
}

export function mapFetchExceptionToKind(err: unknown): AiAdapterErrorKind {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "network_error";
  }
  if (err instanceof TypeError) return "network_error";
  return "request_failed";
}

export function shapeFetchExceptionMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Request timed out after 4 minutes";
  }
  if (err instanceof TypeError) {
    return `Could not reach AI endpoint: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function buildError(
  kind: AiAdapterErrorKind,
  message: string,
): AiAdapterError {
  return { kind, message };
}
