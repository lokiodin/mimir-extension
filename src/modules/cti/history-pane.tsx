import React, { useEffect, useMemo, useState } from "react";
import { useStorageRevision } from "@/storage/context";
import { getCtiHistory } from "@/background/cti-history";
import type { CtiResult, Verdict } from "@/background/cti-types";
import { exportHistoryAsCsv } from "@/modules/cti/csv";

const VERDICT_FILTERS: ReadonlyArray<"all" | Verdict> = [
  "all",
  "malicious",
  "suspicious",
  "clean",
  "unknown",
];

const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  malicious: "bg-red-900 text-red-100",
  suspicious: "bg-amber-900 text-amber-100",
  clean: "bg-emerald-900 text-emerald-100",
  unknown: "bg-gray-700 text-gray-200",
  error: "bg-red-950 text-red-200",
};

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

export interface HistoryPaneProps {
  onSelect: (entry: CtiResult) => void;
  onRefresh: (entry: CtiResult) => void;
  selectedKey: string | null;
}

export const HistoryPane: React.FC<HistoryPaneProps> = ({
  onSelect,
  onRefresh,
  selectedKey,
}) => {
  const revision = useStorageRevision();
  const [entries, setEntries] = useState<CtiResult[]>([]);
  const [filter, setFilter] = useState<"all" | Verdict>("all");

  useEffect(() => {
    let cancelled = false;
    getCtiHistory()
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

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.verdict === filter);
  }, [entries, filter]);

  const handleRowClick = (entry: CtiResult): void => {
    if (entry.staleAfter < Date.now()) {
      onRefresh(entry);
    } else {
      onSelect(entry);
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Filter</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | Verdict)}
          className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-0.5 text-xs"
        >
          {VERDICT_FILTERS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          onClick={() => exportHistoryAsCsv(entries)}
          disabled={entries.length === 0}
          className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 ml-auto"
        >
          Export CSV
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto border border-gray-700 rounded">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 p-2">
            {entries.length === 0
              ? "No lookups yet."
              : "No entries match this filter."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {filtered.map((entry) => {
              const key = `${entry.provider}:${entry.indicatorType}:${entry.indicator}`;
              const isStale = entry.staleAfter < Date.now();
              const isSelected = key === selectedKey;
              return (
                <li key={key}>
                  <button
                    onClick={() => handleRowClick(entry)}
                    className={`w-full text-left px-2 py-1.5 hover:bg-gray-800 ${
                      isSelected ? "bg-gray-800" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${VERDICT_BADGE_CLASS[entry.verdict]}`}
                      >
                        {entry.verdict}
                      </span>
                      <span className="font-mono text-xs text-gray-100 truncate flex-1">
                        {entry.indicator}
                      </span>
                      {isStale && (
                        <span className="text-[10px] text-amber-400">
                          stale
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {entry.provider} · {entry.indicatorType} ·{" "}
                      {relativeTime(entry.timestamp)}
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
