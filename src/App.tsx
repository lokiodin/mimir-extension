import React, { useEffect, useRef } from "react";
import { getModules } from "@/registry/loader";
import { useMimirStore } from "@/store";
import { getSettings, updateSettings } from "@/storage/manager";
import { useContextMenuDispatcher } from "@/surfaces/useContextMenuDispatcher";

const modules = getModules();

const CATEGORY_LABELS: Record<string, string> = {
  encoding: "Encoding",
  utilities: "Utilities",
  cti: "CTI",
  analysis: "Analysis",
  payloads: "Payloads",
};

export const App: React.FC = () => {
  const activeModuleId = useMimirStore((s) => s.activeModuleId);
  const setActiveModuleId = useMimirStore((s) => s.setActiveModuleId);
  const surfaceKind = useMimirStore((s) => s.surfaceKind);

  useContextMenuDispatcher();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await getSettings();
      if (cancelled) return;
      // Re-check the latest state: the context-menu dispatcher may have
      // already routed to a pending right-click target or analysis result.
      // Those paths must win over the restore.
      if (useMimirStore.getState().activeModuleId !== "") return;
      const persisted = settings.lastActiveModuleId;
      const restored =
        persisted && modules.some((m) => m.id === persisted)
          ? persisted
          : modules[0]?.id;
      if (restored) setActiveModuleId(restored);
    })();
    return () => {
      cancelled = true;
    };
  }, [setActiveModuleId]);

  useEffect(() => {
    if (activeModuleId === "") return;
    void updateSettings({ lastActiveModuleId: activeModuleId });
  }, [activeModuleId]);

  const activeModule = modules.find((m) => m.id === activeModuleId);

  const navRef = useRef<HTMLElement>(null);

  const focusModule = (id: string) => {
    setActiveModuleId(id);
    navRef.current
      ?.querySelector<HTMLButtonElement>(`[data-module-id="${id}"]`)
      ?.focus();
  };

  const handleNavKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    if (modules.length === 0) return;
    const cur = Math.max(
      0,
      modules.findIndex((m) => m.id === activeModuleId),
    );
    const next =
      e.key === "ArrowDown"
        ? (cur + 1) % modules.length
        : e.key === "ArrowUp"
          ? (cur - 1 + modules.length) % modules.length
          : e.key === "Home"
            ? 0
            : modules.length - 1;
    focusModule(modules[next].id);
  };

  const openWindow = () => {
    chrome.runtime.sendMessage({ type: "open-window" });
  };

  let currentCategory = "";

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <nav
        ref={navRef}
        aria-label="Modules"
        onKeyDown={handleNavKeyDown}
        className="w-34 border-r border-gray-700 p-2 overflow-y-auto flex flex-col"
      >
        <div className="flex items-center justify-between px-2 py-1 mb-2">
          <h1 className="text-lg font-bold">Mimir</h1>
          {surfaceKind === "popup" && (
            <button
              onClick={openWindow}
              title="Open in window"
              className="text-xs text-gray-400 hover:text-white px-1"
            >
              &#x2197;
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
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
                  data-module-id={mod.id}
                  aria-current={activeModuleId === mod.id ? "true" : undefined}
                  onClick={() => setActiveModuleId(mod.id)}
                  className={`block w-full text-left px-2 py-1 rounded text-sm ${
                    activeModuleId === mod.id
                      ? "bg-gray-700 text-white"
                      : "hover:bg-gray-800"
                  }`}
                >
                  {mod.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
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
