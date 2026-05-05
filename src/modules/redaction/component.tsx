import React, { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/storage/context";
import { useMimirStore } from "@/store";
import { RedactionDiff, detectionId } from "@/components/RedactionDiff";
import { mergeManual, runStage1, runStage2 } from "@/redaction/pipeline";
import {
  createPlaceholderState,
  type Detection,
  type PlaceholderState,
} from "@/redaction/types";

export const RedactionComponent: React.FC = () => {
  const [settings] = useSettings();
  const setActiveModuleId = useMimirStore((s) => s.setActiveModuleId);

  const [input, setInput] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [stage1Ran, setStage1Ran] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stage2Loading, setStage2Loading] = useState(false);

  // Per-session Stage 2 toggle. Initialized from settings each time settings
  // load; user can flip it for the current session without persisting.
  const [stage2Enabled, setStage2Enabled] = useState(false);
  const [providerId, setProviderId] = useState<string>("");

  // Placeholder state lives across runs of Stage 1 and Stage 2 within the
  // same input. Resetting the input wipes it.
  const stateRef = React.useRef<PlaceholderState>(createPlaceholderState());

  useEffect(() => {
    if (!settings) return;
    setStage2Enabled(settings.redactionStage2Enabled ?? false);
  }, [settings]);

  useEffect(() => {
    if (!settings) return;
    if (providerId !== "") {
      const stillExists = settings.aiProviders.some(
        (p) => p.id === providerId,
      );
      if (stillExists) return;
    }
    const fallback =
      (settings.redactionAiProviderId &&
        settings.aiProviders.some(
          (p) => p.id === settings.redactionAiProviderId,
        )
        ? settings.redactionAiProviderId
        : undefined) ??
      (settings.defaultAiProviderId &&
      settings.aiProviders.some((p) => p.id === settings.defaultAiProviderId)
        ? settings.defaultAiProviderId
        : (settings.aiProviders[0]?.id ?? ""));
    setProviderId(fallback);
  }, [settings, providerId]);

  const detectorEnabled = useMemo(
    () => settings?.redactionDetectors ?? {},
    [settings],
  );

  const resetSession = (): void => {
    stateRef.current = createPlaceholderState();
    setDetections([]);
    setAccepted(new Set());
    setStage1Ran(false);
    setErrorMessage(null);
  };

  const handleInputChange = (value: string): void => {
    setInput(value);
    if (stage1Ran) {
      resetSession();
    }
  };

  const handleStage1 = (): void => {
    if (input.trim() === "") return;
    setErrorMessage(null);
    stateRef.current = createPlaceholderState();
    const next = runStage1(input, detectorEnabled, stateRef.current);
    setDetections(next);
    setAccepted(new Set(next.map(detectionId)));
    setStage1Ran(true);
  };

  const handleStage2 = async (): Promise<void> => {
    if (!providerId) return;
    setErrorMessage(null);
    setStage2Loading(true);
    try {
      const additional = await runStage2(
        input,
        detections.filter((d) => d.source === "stage1"),
        { providerId },
        stateRef.current,
      );
      if (additional.length === 0) return;
      const merged = [...detections, ...additional].sort(
        (a, b) => a.start - b.start,
      );
      setDetections(merged);
      setAccepted((prev) => {
        const next = new Set(prev);
        for (const d of additional) next.add(detectionId(d));
        return next;
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setStage2Loading(false);
    }
  };

  const handleToggle = (id: string): void => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddManual = (needle: string): void => {
    const additions = mergeManual(
      input,
      needle,
      "manual",
      detections,
      stateRef.current,
    );
    if (additions.length === 0) return;
    const merged = [...detections, ...additions].sort(
      (a, b) => a.start - b.start,
    );
    setDetections(merged);
    setAccepted((prev) => {
      const next = new Set(prev);
      for (const d of additions) next.add(detectionId(d));
      return next;
    });
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  const noProviders = settings.aiProviders.length === 0;

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleStage1}
          disabled={input.trim() === ""}
          className="px-3 py-1 bg-blue-900 text-blue-100 rounded text-sm hover:bg-blue-800 disabled:opacity-50"
        >
          Run Stage 1
        </button>

        <label className="text-xs text-gray-400 flex items-center gap-1">
          <input
            type="checkbox"
            checked={stage2Enabled}
            onChange={(e) => setStage2Enabled(e.target.checked)}
          />
          Stage 2 (AI)
        </label>

        {stage2Enabled && (
          <>
            {noProviders ? (
              <button
                onClick={() => setActiveModuleId("settings")}
                className="px-2 py-1 bg-gray-700 text-gray-100 rounded text-xs hover:bg-gray-600"
              >
                Configure provider
              </button>
            ) : (
              <>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-xs"
                >
                  {settings.aiProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.type}
                      {p.model ? ` · ${p.model}` : ""})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleStage2}
                  disabled={
                    !providerId ||
                    stage2Loading ||
                    detections.filter((d) => d.source === "stage1").length === 0
                  }
                  className="px-2 py-1 bg-blue-900 text-blue-100 rounded text-xs hover:bg-blue-800 disabled:opacity-50"
                >
                  {stage2Loading ? "Running…" : "Run Stage 2"}
                </button>
              </>
            )}
          </>
        )}

        {stage1Ran && (
          <button
            onClick={resetSession}
            className="ml-auto px-2 py-1 bg-gray-700 text-gray-100 rounded text-xs hover:bg-gray-600"
          >
            Reset
          </button>
        )}
      </div>

      <textarea
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder="Paste text containing IPs, emails, tokens, keys, etc. Click Run Stage 1 to highlight detections."
        spellCheck={false}
        className="min-h-20 max-h-60 bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-gray-500 resize-y"
      />

      {errorMessage !== null && (
        <div
          aria-live="polite"
          className="text-red-300 bg-red-950/40 border border-red-900 px-2 py-1 rounded text-sm break-words"
        >
          {errorMessage}
        </div>
      )}

      {stage1Ran && (
        <>
          <RedactionDiff
            original={input}
            detections={detections}
            accepted={accepted}
            onToggle={handleToggle}
            onAddManual={handleAddManual}
          />
          {detections.length === 0 && (
            <p className="text-xs text-gray-500">
              No detections — text is unchanged. Use the manual-add field above
              to redact a substring by hand.
            </p>
          )}
        </>
      )}
    </div>
  );
};
