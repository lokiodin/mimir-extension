import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  CtiLookupRequest,
  CtiLookupResponse,
  CtiResult,
  IndicatorType,
  Verdict,
} from "@/background/cti-types";
import { detectIndicatorType } from "@/modules/cti/detect";
import { HistoryPane } from "@/modules/cti/history-pane";

type IndicatorChoice = "auto" | IndicatorType;

const INDICATOR_CHOICES: ReadonlyArray<{
  value: IndicatorChoice;
  label: string;
}> = [
  { value: "auto", label: "Auto-detect" },
  { value: "ip", label: "IP" },
  { value: "domain", label: "Domain" },
  { value: "url", label: "URL" },
  { value: "hash", label: "Hash" },
];

const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  malicious: "bg-red-900 text-red-100 border-red-700",
  suspicious: "bg-amber-900 text-amber-100 border-amber-700",
  clean: "bg-emerald-900 text-emerald-100 border-emerald-700",
  unknown: "bg-gray-700 text-gray-200 border-gray-600",
  error: "bg-red-950 text-red-200 border-red-800",
};

function entryKey(e: CtiResult): string {
  return `${e.provider}:${e.indicatorType}:${e.indicator}`;
}

async function sendLookup(req: CtiLookupRequest): Promise<CtiResult> {
  const response = (await chrome.runtime.sendMessage(req)) as
    | CtiLookupResponse
    | undefined;
  if (!response) {
    throw new Error("No response from service worker");
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.result;
}

export const CtiComponent: React.FC = () => {
  const [input, setInput] = useState<string>("");
  const [choice, setChoice] = useState<IndicatorChoice>("auto");
  const [active, setActive] = useState<CtiResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<CtiResult, Error, CtiLookupRequest>({
    mutationFn: sendLookup,
    onSuccess: (result) => {
      setActive(result);
      setErrorMessage(null);
    },
    onError: (err) => {
      setErrorMessage(err.message);
    },
  });

  const resolveType = (): IndicatorType | null => {
    if (choice !== "auto") return choice;
    return detectIndicatorType(input);
  };

  const handleLookup = (): void => {
    const trimmed = input.trim();
    if (trimmed === "") return;
    const indicatorType = resolveType();
    if (!indicatorType) {
      setErrorMessage(
        "Could not detect indicator type. Pick one from the dropdown.",
      );
      return;
    }
    setErrorMessage(null);
    mutation.mutate({
      type: "cti.lookup",
      provider: "virustotal",
      indicatorType,
      indicator: trimmed.toLowerCase(),
      query: trimmed,
    });
  };

  const handleHistorySelect = (entry: CtiResult): void => {
    setActive(entry);
    setErrorMessage(null);
  };

  const handleHistoryRefresh = (entry: CtiResult): void => {
    setErrorMessage(null);
    mutation.mutate({
      type: "cti.lookup",
      provider: entry.provider,
      indicatorType: entry.indicatorType,
      indicator: entry.indicator,
      query: entry.query,
    });
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLookup();
          }}
          placeholder="IP, domain, URL, or file hash"
          spellCheck={false}
          className="flex-1 bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-gray-500"
        />
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value as IndicatorChoice)}
          className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm"
        >
          {INDICATOR_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleLookup}
          disabled={mutation.isPending || input.trim() === ""}
          className="px-3 py-1 bg-blue-900 text-blue-100 rounded text-sm hover:bg-blue-800 disabled:opacity-50"
        >
          {mutation.isPending ? "Looking up..." : "Lookup"}
        </button>
      </div>

      {errorMessage !== null && (
        <div
          aria-live="polite"
          className="text-red-300 bg-red-950/40 border border-red-900 px-2 py-1 rounded text-sm"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <div className="flex flex-col min-h-0 overflow-y-auto">
          {active ? (
            <ResultView entry={active} />
          ) : (
            <p className="text-sm text-gray-500">
              Run a lookup or pick an entry from history to see results.
            </p>
          )}
        </div>
        <HistoryPane
          onSelect={handleHistorySelect}
          onRefresh={handleHistoryRefresh}
          selectedKey={active ? entryKey(active) : null}
        />
      </div>
    </div>
  );
};

const ResultView: React.FC<{ entry: CtiResult }> = ({ entry }) => {
  const isStale = entry.staleAfter < Date.now();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs px-2 py-0.5 rounded border ${VERDICT_BADGE_CLASS[entry.verdict]}`}
        >
          {entry.verdict}
        </span>
        <span className="font-mono text-sm text-gray-100 break-all">
          {entry.indicator}
        </span>
        <span className="text-xs text-gray-500">
          {entry.provider} · {entry.indicatorType}
        </span>
        {isStale && (
          <span className="text-xs text-amber-400">stale — click to refresh</span>
        )}
      </div>
      <div className="text-xs text-gray-500">
        {new Date(entry.timestamp).toLocaleString()}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        {entry.summary.map((field, i) => (
          <React.Fragment key={`${field.label}-${i}`}>
            <dt className="text-gray-400">{field.label}</dt>
            <dd className="text-gray-100 font-mono break-all">{field.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 hover:text-gray-200">
          Raw response
        </summary>
        <pre className="mt-1 max-h-64 overflow-auto bg-gray-950 border border-gray-800 rounded p-2 text-[11px] text-gray-300">
          {JSON.stringify(entry.response, null, 2)}
        </pre>
      </details>
    </div>
  );
};
