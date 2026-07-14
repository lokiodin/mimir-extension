import React, { useEffect, useMemo, useState } from "react";
import { useStorageKey } from "@/storage/context";
import { getCtiHistory } from "@/background/cti-history";
import type {
  CtiHistoryEntry,
  CtiProvider,
  Verdict,
} from "@/background/cti-types";
import { aggregateVerdict, isAnyProviderStale } from "@/modules/cti/aggregation";
import { ProviderIcon } from "@/modules/cti/provider-icons";

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

const PROVIDERS: ReadonlyArray<CtiProvider> = [
  "virustotal",
  "abuseipdb",
  "abusech",
];

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
  onSelect: (entry: CtiHistoryEntry) => void;
  selectedIndicator: string | null;
}

export const HistoryPane: React.FC<HistoryPaneProps> = ({
  onSelect,
  selectedIndicator,
}) => {
  const revision = useStorageKey("cti.history");
  const [entries, setEntries] = useState<CtiHistoryEntry[]>([]);
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
    return entries.filter((e) => aggregateVerdict(e) === filter);
  }, [entries, filter]);

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
              const verdict = aggregateVerdict(entry);
              const isStale = isAnyProviderStale(entry);
              const isSelected = entry.indicator === selectedIndicator;
              return (
                <li key={entry.indicator}>
                  <button
                    onClick={() => onSelect(entry)}
                    className={`w-full text-left px-2 py-1.5 hover:bg-gray-800 ${
                      isSelected ? "bg-gray-800" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${VERDICT_BADGE_CLASS[verdict]}`}
                      >
                        {verdict}
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
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        {PROVIDERS.filter((p) => entry.providers[p]).map(
                          (provider) => (
                            <ProviderIcon
                              key={provider}
                              provider={provider}
                              dim={
                                entry.providers[provider]?.error !== undefined
                              }
                            />
                          ),
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500">
                        {entry.indicatorType} ·{" "}
                        {relativeTime(entry.lastLookupAt)}
                      </span>
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
