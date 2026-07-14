import React, { useEffect, useState } from "react";
import { useStorageKey } from "@/storage/context";
import { getAnalysisHistory } from "@/modules/analysis/history";
import type { AnalysisHistoryEntry } from "@/modules/analysis/types";

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function preview(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 60)}…`;
}

export interface AnalysisHistoryPaneProps {
  onSelect: (entry: AnalysisHistoryEntry) => void;
  selectedId: string | null;
}

export const AnalysisHistoryPane: React.FC<AnalysisHistoryPaneProps> = ({
  onSelect,
  selectedId,
}) => {
  const revision = useStorageKey("analysis.history");
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAnalysisHistory()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="text-xs text-gray-400 px-1">History (last 10)</div>
      <div className="flex-1 min-h-0 overflow-y-auto border border-gray-700 rounded">
        {entries.length === 0 ? (
          <p className="text-xs text-gray-500 p-2">No analyses yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {entries.map((entry) => {
              const isSelected = entry.id === selectedId;
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => onSelect(entry)}
                    className={`w-full text-left px-2 py-1.5 hover:bg-gray-800 ${
                      isSelected ? "bg-gray-800" : ""
                    } ${entry.error ? "border-l-2 border-red-700" : ""}`}
                  >
                    <div
                      className={`text-xs font-mono truncate ${
                        entry.error ? "text-red-300" : "text-gray-200"
                      }`}
                    >
                      {entry.error && (
                        <span className="text-[10px] uppercase mr-1 text-red-400">
                          err
                        </span>
                      )}
                      {preview(entry.input) || "(empty input)"}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {entry.providerLabel} · {relativeTime(entry.timestamp)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
