// HTTP helpers shared by every adapter. The keepalive boundary covers the
// whole fetch (response-headers phase); adapters that consume a streaming
// body (e.g. AI You SSE) wrap their own withKeepalive around the read loop.

import { withKeepalive } from "@/background/keepalive";

export const REQUEST_TIMEOUT_MS = 240_000;

export interface TimedFetchOpts {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export async function timedFetch(opts: TimedFetchOpts): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await withKeepalive(() =>
      fetch(opts.url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        signal: controller.signal,
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return "";
  }
}
