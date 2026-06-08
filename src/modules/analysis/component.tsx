import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MarkdownView } from "@/components/MarkdownView";
import { CopyIconButton } from "@/components/CopyIconButton";
import { useSettings } from "@/storage/context";
import { useMimirStore } from "@/store";
import {
  getAnalysisHistory,
  pushAnalysisHistory,
} from "@/modules/analysis/history";
import { AnalysisHistoryPane } from "@/modules/analysis/history-pane";
import type { AnalysisHistoryEntry } from "@/modules/analysis/types";
import type {
  AiCompleteRequest,
  AiCompleteResponse,
  AiCompleteSuccess,
} from "@/background/ai-types";
import { resolveAnalysisLanguage } from "@/modules/analysis/language";
import type { AnalysisLanguage } from "@/storage/types";

const FEATURE_ID = "log-analysis";

async function sendComplete(
  req: AiCompleteRequest,
): Promise<AiCompleteSuccess> {
  const response = (await chrome.runtime.sendMessage(req)) as
    | AiCompleteResponse
    | undefined;
  if (!response) {
    throw new Error("No response from service worker");
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response;
}

interface CurrentView {
  id: string;
  timestamp: number;
  input: string;
  response: string;
  providerLabel: string;
  error?: boolean;
}

export const AnalysisComponent: React.FC = () => {
  const [settings, updateSettings] = useSettings();
  const setActiveModuleId = useMimirStore((s) => s.setActiveModuleId);
  const pendingAnalysisOpen = useMimirStore((s) => s.pendingAnalysisOpen);
  const setPendingAnalysisOpen = useMimirStore(
    (s) => s.setPendingAnalysisOpen,
  );

  const [input, setInput] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  // Pre-settings-load default; must match resolveAnalysisLanguage's "en" fallback.
  const [language, setLanguage] = useState<AnalysisLanguage>("en");
  const [current, setCurrent] = useState<CurrentView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Default the per-run provider selector to the global default once settings load.
  useEffect(() => {
    if (!settings) return;
    if (providerId !== "") {
      // Re-validate that the chosen provider still exists.
      const stillExists = settings.aiProviders.some((p) => p.id === providerId);
      if (stillExists) return;
    }
    const fallback =
      settings.defaultAiProviderId &&
      settings.aiProviders.some((p) => p.id === settings.defaultAiProviderId)
        ? settings.defaultAiProviderId
        : (settings.aiProviders[0]?.id ?? "");
    setProviderId(fallback);
  }, [settings, providerId]);

  // logAnalysisLanguage write-through is the source of truth: re-sync the
  // dropdown whenever settings change. Idempotent after a write-through.
  useEffect(() => {
    if (!settings) return;
    setLanguage(resolveAnalysisLanguage(settings));
  }, [settings]);

  const mutation = useMutation<AiCompleteSuccess, Error, AiCompleteRequest>({
    mutationFn: sendComplete,
    onSuccess: async (result, variables) => {
      const entry: AnalysisHistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        input: variables.userInput,
        response: result.response,
        providerLabel: result.providerLabel,
        providerType: result.providerType,
      };
      await pushAnalysisHistory(entry);
      setCurrent({
        id: entry.id,
        timestamp: entry.timestamp,
        input: entry.input,
        response: entry.response,
        providerLabel: entry.providerLabel,
      });
      setErrorMessage(null);
    },
    onError: (err) => {
      setErrorMessage(err.message);
    },
  });

  const isLoading = mutation.status === "pending";

  const handleLanguageChange = (next: AnalysisLanguage): void => {
    setLanguage(next);
    // Write-through: persist as the new default (also used by the
    // right-click background path). Does not re-run analysis.
    void updateSettings({ logAnalysisLanguage: next });
  };

  const handleAnalyze = (): void => {
    const trimmed = input.trim();
    if (trimmed === "") return;
    if (!providerId) return;
    setErrorMessage(null);
    mutation.mutate({
      type: "ai.complete",
      providerId,
      featureId: FEATURE_ID,
      userInput: input,
      language,
    });
  };

  const handleHistorySelect = (entry: AnalysisHistoryEntry): void => {
    setErrorMessage(null);
    setInput(entry.input);
    setCurrent({
      id: entry.id,
      timestamp: entry.timestamp,
      input: entry.input,
      response: entry.response,
      providerLabel: entry.providerLabel,
      error: entry.error,
    });
  };

  // Consume the pendingAnalysisOpen slot written by the dispatcher when a
  // background-completion marker is drained. Look up the entry in history
  // and apply it; clear the slot regardless so a missing/evicted entry id
  // does not pin the module on a routing intent that can never resolve.
  useEffect(() => {
    if (!pendingAnalysisOpen) return;
    const { entryId } = pendingAnalysisOpen;
    void (async () => {
      const history = await getAnalysisHistory();
      const entry = history.find((e) => e.id === entryId);
      if (entry) handleHistorySelect(entry);
      setPendingAnalysisOpen(null);
    })();
  }, [pendingAnalysisOpen, setPendingAnalysisOpen]);

  // Auto-restore the newest history entry on open, as if its row had been
  // clicked. Fires once per mount (the component remounts each time the module
  // is opened). Defers to the background-completion routing path, which owns
  // entry selection: skip if a marker is already staged, and re-check after the
  // async history read in case one arrived meanwhile.
  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (didAutoLoad.current) return;
    didAutoLoad.current = true;
    if (pendingAnalysisOpen) return;
    void (async () => {
      const history = await getAnalysisHistory();
      if (history.length === 0) return;
      if (useMimirStore.getState().pendingAnalysisOpen) return;
      handleHistorySelect(history[0]);
    })();
  }, []);

  const noProviders = useMemo(
    () => !!settings && settings.aiProviders.length === 0,
    [settings],
  );

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {noProviders ? (
        <div className="border border-gray-700 rounded p-3 bg-gray-800">
          <p className="text-sm text-gray-300">
            No AI providers configured. Open Settings → AI Providers to add one.
          </p>
          <button
            onClick={() => setActiveModuleId("settings")}
            className="mt-2 px-3 py-1 bg-gray-700 text-gray-100 rounded text-xs hover:bg-gray-600"
          >
            Open Settings
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 shrink-0">Provider</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="flex-1 min-w-0 bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              {settings.aiProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.type}
                  {p.model ? ` · ${p.model}` : ""})
                </option>
              ))}
            </select>
            <select
              value={language}
              onChange={(e) =>
                handleLanguageChange(e.target.value as AnalysisLanguage)
              }
              aria-label="Output language"
              className="shrink-0 bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
            <button
              onClick={handleAnalyze}
              disabled={isLoading || input.trim() === "" || !providerId}
              className="shrink-0 px-3 py-1 bg-blue-900 text-blue-100 rounded text-sm hover:bg-blue-800 disabled:opacity-50"
            >
              {isLoading ? "Analyzing…" : "Analyze"}
            </button>
          </div>

          <div
            className="grid gap-3 flex-1 min-h-0"
            style={{ gridTemplateColumns: "4fr 1fr" }}
          >
            <div className="flex flex-col gap-2 min-h-0 min-w-0">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste log content here. Sent as-is to the configured AI — no automatic redaction."
                spellCheck={false}
                className="min-h-15 max-h-72 bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-gray-500 resize-y"
              />

              {errorMessage !== null && (
                <div
                  aria-live="polite"
                  className="text-red-300 bg-red-950/40 border border-red-900 px-2 py-1 rounded text-sm break-words"
                >
                  Analysis failed: {errorMessage}
                </div>
              )}

              <div className="relative flex-1 min-h-0 overflow-y-auto border border-gray-700 rounded p-3 bg-gray-900">
                {current === null ? (
                  <p className="text-sm text-gray-500">
                    Paste a log snippet and click Analyze.
                  </p>
                ) : (
                  <>
                    <CopyIconButton
                      text={current.response}
                      label="Copy raw Markdown"
                    />
                    <div className="text-xs text-gray-500 mb-2 pr-8 flex items-center gap-2">
                      {current.error && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-red-950/60 text-red-200 border border-red-900 rounded">
                          Error
                        </span>
                      )}
                      <span>
                        Provider: {current.providerLabel} · {" "}
                        {new Date(current.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {current.error ? (
                      <pre className="text-sm text-red-200 bg-red-950/30 border border-red-900 rounded p-2 whitespace-pre-wrap break-words">
                        {current.response}
                      </pre>
                    ) : (
                      <MarkdownView content={current.response} />
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <AnalysisHistoryPane
                onSelect={handleHistorySelect}
                selectedId={current?.id ?? null}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
