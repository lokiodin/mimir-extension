import React, { useEffect, useId, useMemo, useState } from "react";

// Shared "input -> transform-selector -> output" shell used by Encoding,
// Defang, and any future transform-shaped module. See TECHNICAL_DESIGN.md
// section 10.1.
//
// The base props mirror the documented interface. Optional extensions:
//   - `group` on each transform: renders the selector as <optgroup> chunks.
//   - `inverse` on each transform: enables the bidirectional swap to flip
//     to the paired transform after moving output to input.
//   - controlled `value` / `onValueChange` and `transformId` /
//     `onTransformIdChange`: lets a parent own state (used by Encoding to
//     persist the input across popup reopens).

export interface TextTransform {
  id: string;
  label: string;
  fn: (input: string) => string | Promise<string>;
  group?: string;
  inverse?: string;
}

export interface TextTransformPanelProps {
  inputLabel?: string;
  outputLabel?: string;
  transforms: ReadonlyArray<TextTransform>;
  defaultTransformId?: string;
  bidirectional?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  transformId?: string;
  onTransformIdChange?: (id: string) => void;
}

type CopyTarget = "input" | "output";

const COPY_BUTTON_CLASS =
  "text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800";

export const TextTransformPanel: React.FC<TextTransformPanelProps> = ({
  inputLabel = "Input",
  outputLabel = "Output",
  transforms,
  defaultTransformId,
  bidirectional = false,
  value: valueProp,
  onValueChange,
  transformId: transformIdProp,
  onTransformIdChange,
}) => {
  const baseId = useId();
  const opId = `${baseId}-op`;
  const inputId = `${baseId}-input`;
  const outputId = `${baseId}-output`;

  const initialTransformId = defaultTransformId ?? transforms[0]?.id ?? "";

  const [internalValue, setInternalValue] = useState<string>("");
  const [internalTransformId, setInternalTransformId] =
    useState<string>(initialTransformId);
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const isValueControlled = valueProp !== undefined;
  const isTransformControlled = transformIdProp !== undefined;
  const value = isValueControlled ? valueProp : internalValue;
  const transformId = isTransformControlled
    ? transformIdProp
    : internalTransformId;

  const setValue = (next: string): void => {
    if (!isValueControlled) setInternalValue(next);
    onValueChange?.(next);
  };
  const setTransformId = (next: string): void => {
    if (!isTransformControlled) setInternalTransformId(next);
    onTransformIdChange?.(next);
  };

  useEffect(() => {
    if (value === "") {
      setOutput("");
      setError(null);
      return;
    }
    const transform = transforms.find((t) => t.id === transformId);
    if (!transform) {
      setOutput("");
      setError("Unknown transform");
      return;
    }
    let cancelled = false;
    try {
      const result = transform.fn(value);
      if (result instanceof Promise) {
        result
          .then((out) => {
            if (cancelled) return;
            setOutput(out);
            setError(null);
          })
          .catch((e: unknown) => {
            if (cancelled) return;
            setOutput("");
            setError(e instanceof Error ? e.message : String(e));
          });
      } else {
        setOutput(result);
        setError(null);
      }
    } catch (e) {
      setOutput("");
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      cancelled = true;
    };
  }, [value, transformId, transforms]);

  const copyText = async (text: string, target: CopyTarget): Promise<void> => {
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

  const handleSwap = (): void => {
    if (output === "") return;
    setValue(output);
    const active = transforms.find((t) => t.id === transformId);
    if (active?.inverse) {
      const inverse = transforms.find((t) => t.id === active.inverse);
      if (inverse) setTransformId(inverse.id);
    }
  };

  const hasGroups = transforms.some((t) => t.group !== undefined);
  const groupedTransforms = useMemo(() => {
    if (!hasGroups) return null;
    const seen = new Set<string>();
    const order: string[] = [];
    for (const t of transforms) {
      const g = t.group ?? "";
      if (!seen.has(g)) {
        seen.add(g);
        order.push(g);
      }
    }
    return order.map((g) => ({
      group: g,
      ops: transforms.filter((t) => (t.group ?? "") === g),
    }));
  }, [transforms, hasGroups]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor={opId} className="text-sm text-gray-300">
          Operation
        </label>
        <select
          id={opId}
          value={transformId}
          onChange={(e) => setTransformId(e.target.value)}
          className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm"
        >
          {hasGroups && groupedTransforms
            ? groupedTransforms.map(({ group, ops }) => (
                <optgroup key={group} label={group}>
                  {ops.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))
            : transforms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
        </select>
        {bidirectional && (
          <button
            onClick={handleSwap}
            disabled={output === ""}
            className={COPY_BUTTON_CLASS}
            title="Move output to input and switch to the inverse transform"
          >
            Swap
          </button>
        )}
      </div>

      <div className="flex flex-col flex-1 min-h-0 gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="text-xs text-gray-400">
            {inputLabel}
          </label>
          <button
            onClick={() => void copyText(value, "input")}
            disabled={value === ""}
            className={COPY_BUTTON_CLASS}
          >
            {copied === "input" ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
          <label htmlFor={outputId} className="text-xs text-gray-400">
            {outputLabel}
          </label>
          <button
            onClick={() => void copyText(output, "output")}
            disabled={output === ""}
            className={COPY_BUTTON_CLASS}
          >
            {copied === "output" ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          id={outputId}
          value={output}
          readOnly
          spellCheck={false}
          className="flex-1 min-h-[6rem] resize-none bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 font-mono text-sm focus:outline-none"
        />
      </div>
    </div>
  );
};
