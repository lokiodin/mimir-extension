import React, { useMemo, useRef, useState } from "react";
import { applyRedactions } from "@/redaction/pipeline";
import type { Detection, DetectionSource } from "@/redaction/types";

// Stage 3 split-pane diff. See TECHNICAL_DESIGN.md §5.4.

interface RedactionDiffProps {
  original: string;
  detections: ReadonlyArray<Detection>;
  // Detection IDs the user has accepted (i.e. that get redacted on Apply).
  // Identified by `${start}:${end}:${type}` since detections are otherwise
  // ephemeral.
  accepted: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onAddManual: (needle: string) => void;
  onApply: (finalText: string) => void;
}

export function detectionId(d: Detection): string {
  return `${d.start}:${d.end}:${d.type}`;
}

const SOURCE_STYLE: Record<DetectionSource, string> = {
  stage1: "bg-amber-900/40 border-amber-600 text-amber-100",
  stage2: "bg-blue-900/40 border-blue-600 text-blue-100",
  manual: "bg-violet-900/40 border-violet-600 text-violet-100",
};

const SOURCE_REJECTED = "bg-gray-800 border-gray-600 text-gray-400 line-through";

export const RedactionDiff: React.FC<RedactionDiffProps> = ({
  original,
  detections,
  accepted,
  onToggle,
  onAddManual,
  onApply,
}) => {
  const [manualDraft, setManualDraft] = useState("");

  const acceptedDetections = useMemo(
    () => detections.filter((d) => accepted.has(detectionId(d))),
    [detections, accepted],
  );

  const preview = useMemo(
    () => applyRedactions(original, acceptedDetections),
    [original, acceptedDetections],
  );

  const handleAddManual = (): void => {
    const needle = manualDraft.trim();
    if (needle.length === 0) return;
    onAddManual(needle);
    setManualDraft("");
  };

  const handleApply = (): void => {
    onApply(preview);
  };

  // Synchronized scrolling between the two panes. A guard flag prevents
  // the echoed scroll from re-firing the handler in a loop.
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  const mirrorScroll = (
    source: HTMLDivElement | null,
    target: HTMLDivElement | null,
  ): void => {
    if (!source || !target) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    const sMaxY = source.scrollHeight - source.clientHeight;
    const sMaxX = source.scrollWidth - source.clientWidth;
    const tMaxY = target.scrollHeight - target.clientHeight;
    const tMaxX = target.scrollWidth - target.clientWidth;
    target.scrollTop = sMaxY > 0 ? (source.scrollTop / sMaxY) * tMaxY : 0;
    target.scrollLeft = sMaxX > 0 ? (source.scrollLeft / sMaxX) * tMaxX : 0;
    // Release the guard on the next frame so the echoed scroll event has
    // already fired and been ignored.
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      <div
        className="grid gap-2 flex-1 min-h-0"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <Pane
          label={`Original (${detections.length} detections)`}
          scrollRef={leftScrollRef}
          onScroll={() =>
            mirrorScroll(leftScrollRef.current, rightScrollRef.current)
          }
        >
          <HighlightedText
            text={original}
            detections={detections}
            accepted={accepted}
            onToggle={onToggle}
          />
        </Pane>
        <Pane
          label="Redacted preview"
          scrollRef={rightScrollRef}
          onScroll={() =>
            mirrorScroll(rightScrollRef.current, leftScrollRef.current)
          }
        >
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-100">
            {preview}
          </pre>
        </Pane>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-700 pt-2">
        <input
          type="text"
          value={manualDraft}
          onChange={(e) => setManualDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddManual();
            }
          }}
          placeholder="Add manual redaction (substring of original)"
          className="flex-1 min-w-[12rem] bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-gray-500"
        />
        <button
          onClick={handleAddManual}
          disabled={manualDraft.trim().length === 0}
          className="px-3 py-1 bg-gray-700 text-gray-100 rounded text-sm hover:bg-gray-600 disabled:opacity-50"
        >
          Add manual
        </button>
        <button
          onClick={handleApply}
          className="ml-auto px-3 py-1 bg-blue-900 text-blue-100 rounded text-sm hover:bg-blue-800"
        >
          Apply
        </button>
      </div>

      <Legend />
    </div>
  );
};

interface PaneProps {
  label: string;
  children: React.ReactNode;
  scrollRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

const Pane: React.FC<PaneProps> = ({ label, children, scrollRef, onScroll }) => (
  <div className="flex flex-col min-h-0 min-w-0 border border-gray-700 rounded bg-gray-900">
    <div className="px-2 py-1 border-b border-gray-700 text-xs text-gray-400">
      {label}
    </div>
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-auto p-2"
    >
      {children}
    </div>
  </div>
);

interface HighlightedTextProps {
  text: string;
  detections: ReadonlyArray<Detection>;
  accepted: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  detections,
  accepted,
  onToggle,
}) => {
  const sorted = useMemo(
    () => [...detections].sort((a, b) => a.start - b.start),
    [detections],
  );

  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (const d of sorted) {
    if (d.start < cursor) continue; // Defensive: skip overlaps.
    if (d.start > cursor) {
      pieces.push(
        <span key={`t-${cursor}`}>{text.slice(cursor, d.start)}</span>,
      );
    }
    const id = detectionId(d);
    const isAccepted = accepted.has(id);
    const className = isAccepted ? SOURCE_STYLE[d.source] : SOURCE_REJECTED;
    pieces.push(
      <button
        key={`d-${d.start}-${d.type}`}
        onClick={() => onToggle(id)}
        title={`${d.type} → ${d.placeholder}${
          isAccepted ? " (click to keep original)" : " (click to redact)"
        }`}
        className={`inline border rounded px-1 mx-px text-xs cursor-pointer hover:brightness-110 ${className}`}
      >
        {text.slice(d.start, d.end)}
      </button>,
    );
    cursor = d.end;
  }
  if (cursor < text.length) {
    pieces.push(<span key={`t-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-100">
      {pieces}
    </pre>
  );
};

const Legend: React.FC = () => (
  <div className="flex flex-wrap gap-3 text-xs text-gray-400">
    <span className="flex items-center gap-1">
      <span
        className={`inline-block w-3 h-3 border rounded ${SOURCE_STYLE.stage1}`}
      />
      Stage 1 (deterministic)
    </span>
    <span className="flex items-center gap-1">
      <span
        className={`inline-block w-3 h-3 border rounded ${SOURCE_STYLE.stage2}`}
      />
      Stage 2 (AI)
    </span>
    <span className="flex items-center gap-1">
      <span
        className={`inline-block w-3 h-3 border rounded ${SOURCE_STYLE.manual}`}
      />
      Manual
    </span>
    <span className="ml-auto">Click a span to toggle accept / reject.</span>
  </div>
);
