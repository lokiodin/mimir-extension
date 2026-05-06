import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  CtiHistoryEntry,
  CtiLookupRequest,
  CtiLookupResponse,
  CtiProvider,
  CtiResult,
  IndicatorType,
  Verdict,
} from "@/background/cti-types";
import { detectIndicatorType } from "@/modules/cti/detect";
import { HistoryPane } from "@/modules/cti/history-pane";
import { useApiKey, useSettings } from "@/storage/context";
import { useMimirStore } from "@/store";

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

const PROVIDERS: ReadonlyArray<CtiProvider> = [
  "virustotal",
  "abuseipdb",
  "abusech",
];

const PROVIDER_LABELS: Record<CtiProvider, string> = {
  virustotal: "VirusTotal",
  abuseipdb: "AbuseIPDB",
  abusech: "abuse.ch",
};

const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  malicious: "bg-red-900 text-red-100 border-red-700",
  suspicious: "bg-amber-900 text-amber-100 border-amber-700",
  clean: "bg-emerald-900 text-emerald-100 border-emerald-700",
  unknown: "bg-gray-700 text-gray-200 border-gray-600",
  error: "bg-red-950 text-red-200 border-red-800",
};

type CardState =
  | { kind: "idle" }
  | { kind: "loading"; indicator: string }
  | { kind: "result"; result: CtiResult }
  | { kind: "error"; message: string }
  | { kind: "not-applicable"; reason: string }
  | { kind: "not-configured"; reason: string };

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<CtiProvider, CardState>>({
    virustotal: { kind: "idle" },
    abuseipdb: { kind: "idle" },
    abusech: { kind: "idle" },
  });
  const [expanded, setExpanded] = useState<Record<CtiProvider, boolean>>({
    virustotal: true,
    abuseipdb: true,
    abusech: true,
  });
  const [selectedIndicator, setSelectedIndicator] = useState<string | null>(null);

  const setActiveModuleId = useMimirStore((s) => s.setActiveModuleId);
  const pendingInput = useMimirStore((s) => s.pendingInput);
  const setPendingInput = useMimirStore((s) => s.setPendingInput);
  const [settings] = useSettings();
  const [abuseipdbKey] = useApiKey("abuseipdb");
  const [abusechKey] = useApiKey("abusech");

  useEffect(() => {
    if (pendingInput?.moduleId !== "cti") return;
    setInput(pendingInput.value);
    setChoice("auto");
    setPendingInput(null);
  }, [pendingInput, setPendingInput]);

  const setCard = (provider: CtiProvider, state: CardState): void => {
    setCards((prev) => ({ ...prev, [provider]: state }));
  };

  const vtMutation = useMutation<CtiResult, Error, CtiLookupRequest>({
    mutationFn: sendLookup,
    onSuccess: (result) => setCard("virustotal", { kind: "result", result }),
    onError: (err) =>
      setCard("virustotal", { kind: "error", message: err.message }),
  });
  const abuseipdbMutation = useMutation<CtiResult, Error, CtiLookupRequest>({
    mutationFn: sendLookup,
    onSuccess: (result) => setCard("abuseipdb", { kind: "result", result }),
    onError: (err) =>
      setCard("abuseipdb", { kind: "error", message: err.message }),
  });
  const abusechMutation = useMutation<CtiResult, Error, CtiLookupRequest>({
    mutationFn: sendLookup,
    onSuccess: (result) => setCard("abusech", { kind: "result", result }),
    onError: (err) =>
      setCard("abusech", { kind: "error", message: err.message }),
  });

  const mutations: Record<
    CtiProvider,
    typeof vtMutation
  > = {
    virustotal: vtMutation,
    abuseipdb: abuseipdbMutation,
    abusech: abusechMutation,
  };

  // Configuration check per provider for a given indicator type.
  const evaluateProvider = (
    provider: CtiProvider,
    indicatorType: IndicatorType,
  ): { run: true } | { run: false; state: CardState } => {
    if (provider === "abuseipdb" && indicatorType !== "ip") {
      return {
        run: false,
        state: {
          kind: "not-applicable",
          reason: "AbuseIPDB only supports IPs.",
        },
      };
    }
    if (provider === "abuseipdb" && !abuseipdbKey) {
      return {
        run: false,
        state: { kind: "not-configured", reason: "API key not set." },
      };
    }
    if (
      provider === "abusech" &&
      settings?.abusechMode === "api" &&
      !abusechKey
    ) {
      return {
        run: false,
        state: {
          kind: "not-configured",
          reason: "API mode selected but no API key.",
        },
      };
    }
    return { run: true };
  };

  const resolveType = (): IndicatorType | null => {
    if (choice !== "auto") return choice;
    return detectIndicatorType(input);
  };

  const runForProvider = (
    provider: CtiProvider,
    indicator: string,
    indicatorType: IndicatorType,
    query: string,
  ): void => {
    const decision = evaluateProvider(provider, indicatorType);
    if (!decision.run) {
      setCard(provider, decision.state);
      return;
    }
    setCard(provider, { kind: "loading", indicator });
    mutations[provider].mutate({
      type: "cti.lookup",
      provider,
      indicatorType,
      indicator,
      query,
    });
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
    const canonical = trimmed.toLowerCase();
    setSelectedIndicator(canonical);
    for (const provider of PROVIDERS) {
      runForProvider(provider, canonical, indicatorType, trimmed);
    }
  };

  const handleHistorySelect = (entry: CtiHistoryEntry): void => {
    setErrorMessage(null);
    setSelectedIndicator(entry.indicator);
    const next: Record<CtiProvider, CardState> = {
      virustotal: { kind: "idle" },
      abuseipdb: { kind: "idle" },
      abusech: { kind: "idle" },
    };
    for (const provider of PROVIDERS) {
      const slot = entry.providers[provider];
      if (!slot) continue;
      if (slot.error) {
        next[provider] = { kind: "error", message: slot.error.message };
      } else {
        next[provider] = {
          kind: "result",
          result: {
            provider,
            indicatorType: entry.indicatorType,
            indicator: entry.indicator,
            query: entry.query,
            timestamp: slot.lookedUpAt,
            staleAfter: slot.staleAfter,
            verdict: slot.verdict,
            summary: slot.summary,
            response: slot.response,
          },
        };
      }
    }
    setCards(next);
    setExpanded({ virustotal: true, abuseipdb: true, abusech: true });
  };

  const anyLoading = useMemo(
    () => PROVIDERS.some((p) => cards[p].kind === "loading"),
    [cards],
  );

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
          disabled={anyLoading || input.trim() === ""}
          className="px-3 py-1 bg-blue-900 text-blue-100 rounded text-sm hover:bg-blue-800 disabled:opacity-50"
        >
          {anyLoading ? "Looking up..." : "Lookup"}
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

      <div
        className="grid gap-3 flex-1 min-h-0"
        style={{ gridTemplateColumns: "2fr 1fr" }}
      >
        <div className="flex flex-col gap-2 min-h-0 min-w-0 overflow-y-auto">
          {PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider}
              provider={provider}
              state={cards[provider]}
              expanded={expanded[provider]}
              onToggleExpanded={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [provider]: !prev[provider],
                }))
              }
              onOpenSettings={() => setActiveModuleId("settings")}
            />
          ))}
        </div>
        <div className="min-w-0">
          <HistoryPane
            onSelect={handleHistorySelect}
            selectedIndicator={selectedIndicator}
          />
        </div>
      </div>
    </div>
  );
};

interface ProviderCardProps {
  provider: CtiProvider;
  state: CardState;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenSettings: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  state,
  expanded,
  onToggleExpanded,
  onOpenSettings,
}) => {
  const verdict: Verdict | null =
    state.kind === "result"
      ? state.result.verdict
      : state.kind === "error"
        ? "error"
        : null;

  return (
    <div className="border border-gray-700 rounded">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800"
      >
        <span className="text-gray-400 text-xs w-3">
          {expanded ? "▼" : "▶"}
        </span>
        {verdict ? (
          <span
            className={`text-xs px-2 py-0.5 rounded border ${VERDICT_BADGE_CLASS[verdict]}`}
          >
            {verdict}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded border bg-gray-800 text-gray-500 border-gray-700">
            {stateBadgeLabel(state)}
          </span>
        )}
        <span className="text-sm text-gray-200 font-medium">
          {PROVIDER_LABELS[provider]}
        </span>
        <span className="ml-auto text-xs text-gray-500 truncate">
          {previewLine(state)}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-gray-800">
          <CardBody state={state} onOpenSettings={onOpenSettings} />
        </div>
      )}
    </div>
  );
};

function stateBadgeLabel(state: CardState): string {
  switch (state.kind) {
    case "idle":
      return "idle";
    case "loading":
      return "loading";
    case "not-applicable":
      return "n/a";
    case "not-configured":
      return "no key";
    case "error":
      return "error";
    case "result":
      return state.result.verdict;
  }
}

function previewLine(state: CardState): string {
  switch (state.kind) {
    case "idle":
      return "Run a lookup to populate.";
    case "loading":
      return state.indicator;
    case "not-applicable":
      return state.reason;
    case "not-configured":
      return state.reason;
    case "error":
      return state.message;
    case "result": {
      const first = state.result.summary[0];
      return first ? `${first.label}: ${first.value}` : state.result.indicator;
    }
  }
}

interface CardBodyProps {
  state: CardState;
  onOpenSettings: () => void;
}

const CardBody: React.FC<CardBodyProps> = ({ state, onOpenSettings }) => {
  switch (state.kind) {
    case "idle":
      return (
        <p className="text-sm text-gray-500">No lookup yet.</p>
      );
    case "loading":
      return (
        <p className="text-sm text-gray-400">Looking up {state.indicator}…</p>
      );
    case "not-applicable":
      return <p className="text-sm text-gray-400">{state.reason}</p>;
    case "not-configured":
      return (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-400">{state.reason}</p>
          <button
            onClick={onOpenSettings}
            className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700"
          >
            Open Settings
          </button>
        </div>
      );
    case "error":
      return (
        <p className="text-sm text-red-300 break-words">{state.message}</p>
      );
    case "result":
      return <ResultView entry={state.result} />;
  }
};

const ResultView: React.FC<{ entry: CtiResult }> = ({ entry }) => {
  const isStale = entry.staleAfter < Date.now();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm text-gray-100 break-all">
          {entry.indicator}
        </span>
        <span className="text-xs text-gray-500">{entry.indicatorType}</span>
        {isStale && (
          <span className="text-xs text-amber-400">
            stale — re-run to refresh
          </span>
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

