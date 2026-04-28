import React, { useState } from "react";
import { getModules } from "@/registry/loader";

const modules = getModules();

const CATEGORY_LABELS: Record<string, string> = {
  encoding: "Encoding",
  utilities: "Utilities",
  cti: "CTI",
  analysis: "Analysis",
  payloads: "Payloads",
};

export const App: React.FC = () => {
  const [activeId, setActiveId] = useState(modules[0]?.id ?? "");
  const activeModule = modules.find((m) => m.id === activeId);

  let currentCategory = "";

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <nav className="w-48 border-r border-gray-700 p-2 overflow-y-auto">
        <h1 className="text-lg font-bold px-2 py-1 mb-2">Mimir</h1>
        {modules.map((mod) => {
          const showHeader = mod.category !== currentCategory;
          currentCategory = mod.category;
          return (
            <React.Fragment key={mod.id}>
              {showHeader && (
                <div className="text-xs text-gray-500 uppercase tracking-wide px-2 pt-3 pb-1">
                  {CATEGORY_LABELS[mod.category] ?? mod.category}
                </div>
              )}
              <button
                onClick={() => setActiveId(mod.id)}
                className={`block w-full text-left px-2 py-1 rounded text-sm ${
                  activeId === mod.id
                    ? "bg-gray-700 text-white"
                    : "hover:bg-gray-800"
                }`}
              >
                {mod.label}
              </button>
            </React.Fragment>
          );
        })}
      </nav>
      <main className="flex-1 overflow-y-auto p-4">
        {activeModule ? (
          <activeModule.component />
        ) : (
          <p className="text-gray-500">No module selected.</p>
        )}
      </main>
    </div>
  );
};
