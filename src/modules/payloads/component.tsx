import React, { useMemo, useState } from "react";
import { CopyIconButton } from "@/components/CopyIconButton";
import { CATEGORIES } from "@/modules/payloads/registry";
import type { PayloadEntry } from "@/modules/payloads/types";

const matches = (entry: PayloadEntry, needle: string): boolean => {
  if (needle === "") return true;
  const q = needle.toLowerCase();
  if (entry.label.toLowerCase().includes(q)) return true;
  if (entry.notes.toLowerCase().includes(q)) return true;
  if (entry.payload.toLowerCase().includes(q)) return true;
  return entry.tags.some((t) => t.toLowerCase().includes(q));
};

export const PayloadsComponent: React.FC = () => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    CATEGORIES[0]?.id ?? "",
  );
  const [search, setSearch] = useState<string>("");

  const activeCategory =
    CATEGORIES.find((c) => c.id === activeCategoryId) ?? CATEGORIES[0];

  const filtered = useMemo<PayloadEntry[]>(() => {
    if (!activeCategory) return [];
    return activeCategory.entries.filter((e) => matches(e, search));
  }, [activeCategory, search]);

  if (!activeCategory) {
    return <p className="text-gray-500">No payload categories bundled.</p>;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => {
          const isActive = cat.id === activeCategory.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`text-sm px-3 py-1 rounded border ${
                isActive
                  ? "bg-gray-700 text-white border-gray-600"
                  : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Filter ${activeCategory.label} (label, notes, payload, tags)`}
        spellCheck={false}
        className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-gray-500"
      />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm">No payloads match.</p>
        ) : (
          filtered.map((entry) => {
            return (
              <div
                key={entry.id}
                className="border border-gray-700 rounded p-2 bg-gray-800/50 flex flex-col gap-1"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-100 font-medium">
                      {entry.label}
                    </span>
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] uppercase tracking-wide text-gray-400 bg-gray-900 border border-gray-700 rounded px-1 py-px"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">{entry.notes}</span>
                </div>
                <div className="relative">
                  <pre className="text-xs font-mono text-gray-100 bg-gray-900 border border-gray-800 rounded p-2 pr-8 overflow-x-auto whitespace-pre">
                    {entry.payload}
                  </pre>
                  <CopyIconButton
                    text={entry.payload}
                    label={`Copy payload: ${entry.label}`}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
