import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;
function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
  });
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `mimir-mermaid-${counter}`;
}

export const MermaidView: React.FC<{ chart: string }> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  const trimmed = chart.trim();
  const hasContent = trimmed !== "";

  useEffect(() => {
    if (!hasContent) {
      setError(null);
      setRendered(false);
      if (containerRef.current) containerRef.current.innerHTML = "";
      return;
    }
    ensureInit();
    let cancelled = false;
    const id = nextId();
    setRendered(false);
    (async () => {
      try {
        const { svg } = await mermaid.render(id, trimmed);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
        setError(null);
        setRendered(true);
      } catch (err) {
        if (cancelled) return;
        if (containerRef.current) containerRef.current.innerHTML = "";
        setError(err instanceof Error ? err.message : String(err));
        setRendered(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trimmed, hasContent]);

  if (!hasContent) return null;

  if (error !== null) {
    return (
      <div className="my-2 border border-red-900 bg-red-950/40 rounded p-2 text-xs text-red-300 break-words">
        <div className="font-semibold mb-1">Mermaid render error</div>
        <div className="whitespace-pre-wrap">{error}</div>
        <details className="mt-1 opacity-80">
          <summary className="cursor-pointer">show source</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">{trimmed}</pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`my-2 bg-gray-900 border border-gray-800 rounded p-2 overflow-auto ${rendered ? "" : "min-h-8"}`}
    />
  );
};
