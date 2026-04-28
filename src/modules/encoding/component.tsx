import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  OPERATIONS,
  type OperationId,
} from "@/modules/encoding/operations";
import { storageGet, storageSet } from "@/storage/manager";

const GROUP_ORDER = ["Base64", "Hex", "URL", "HTML", "JWT"] as const;
const STORAGE_KEY = "encoding.state";
const PERSIST_DEBOUNCE_MS = 250;

type CopyTarget = "input" | "output";

interface PersistedState {
  operationId: OperationId;
  input: string;
}

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.input !== "string") return false;
  if (typeof v.operationId !== "string") return false;
  return OPERATIONS.some((o) => o.id === v.operationId);
}

export const EncodingComponent: React.FC = () => {
  const [operationId, setOperationId] = useState<OperationId>("base64-encode");
  const [input, setInput] = useState<string>("");
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const persistTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    storageGet<unknown>(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (isPersistedState(raw)) {
          setOperationId(raw.operationId);
          setInput(raw.input);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current);
    }
    persistTimer.current = window.setTimeout(() => {
      void storageSet(STORAGE_KEY, {
        operationId,
        input,
      } satisfies PersistedState);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
    };
  }, [hydrated, operationId, input]);

  const { output, error } = useMemo<{
    output: string;
    error: string | null;
  }>(() => {
    if (input === "") return { output: "", error: null };
    const op = OPERATIONS.find((o) => o.id === operationId);
    if (!op) return { output: "", error: "Unknown operation" };
    try {
      return { output: op.fn(input), error: null };
    } catch (e) {
      return {
        output: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [operationId, input]);

  const copyText = async (text: string, target: CopyTarget) => {
    if (text === "") return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      window.setTimeout(() => {
        setCopied((current) => (current === target ? null : current));
      }, 1500);
    } catch {
      // Clipboard write can fail when the surface lacks focus; surface
      // nothing — the user can re-trigger or select the text manually.
    }
  };

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    ops: OPERATIONS.filter((o) => o.group === group),
  }));

  const copyButtonClass =
    "text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800";

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="encoding-op" className="text-sm text-gray-300">
          Operation
        </label>
        <select
          id="encoding-op"
          value={operationId}
          onChange={(e) => setOperationId(e.target.value as OperationId)}
          className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm"
        >
          {grouped.map(({ group, ops }) => (
            <optgroup key={group} label={group}>
              {ops.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex flex-col flex-1 min-h-0 gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="encoding-input" className="text-xs text-gray-400">
            Input
          </label>
          <button
            onClick={() => copyText(input, "input")}
            disabled={input === ""}
            className={copyButtonClass}
          >
            {copied === "input" ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          id="encoding-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          className="flex-1 min-h-[6rem] resize-none bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 font-mono text-sm focus:outline-none focus:border-gray-500"
        />
      </div>

      {error !== null && (
        <div
          aria-live="polite"
          className="text-red-400 bg-red-950/30 border border-red-900/50 px-2 py-1 rounded text-sm font-mono"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="encoding-output" className="text-xs text-gray-400">
            Output
          </label>
          <button
            onClick={() => copyText(output, "output")}
            disabled={output === ""}
            className={copyButtonClass}
          >
            {copied === "output" ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          id="encoding-output"
          value={output}
          readOnly
          spellCheck={false}
          className="flex-1 min-h-[6rem] resize-none bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 font-mono text-sm focus:outline-none"
        />
      </div>
    </div>
  );
};
