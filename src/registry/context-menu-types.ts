// SW-side context-menu registry types.
// Each opt-in module ships a sibling file `src/modules/<id>/context-menu.ts`
// with `default` matching `ContextMenuEntry`. The SW collects these via
// require.context (src/background/context-menu-registry.ts) — separate from
// the popup React registry so background.js doesn't pull React into its bundle.
// See TECHNICAL_DESIGN.md §4.3.

type ContextType = chrome.contextMenus.ContextType;

interface BaseEntry {
  moduleId: string; // matches MimirModule.id
  title: string; // user-visible right-click label
  contexts?: ReadonlyArray<ContextType>; // default: ["selection"]
}

// Popup-mode: SW writes the pending selection to chrome.storage.local and
// opens the popup. The popup-side dispatcher reads the pending key, switches
// the active module, and prefills the input via the Zustand pendingInput slot.
export interface PopupContextMenuEntry extends BaseEntry {
  invocation: { kind: "popup" };
}

// Background-mode: SW invokes `run(selection)` directly without opening the
// popup. The runner manages its own badge / history side effects. Used for
// long-running async work (Log Analysis) where opening the popup would
// interrupt the user's flow.
export interface BackgroundContextMenuEntry extends BaseEntry {
  invocation: {
    kind: "background";
    run: (selection: string) => Promise<void>;
  };
}

export type ContextMenuEntry = PopupContextMenuEntry | BackgroundContextMenuEntry;

// Storage key + payload shape for popup-mode invocations. Lives here (with
// types) rather than in src/background/context-menus.ts so popup-side code
// can import it without dragging the SW lifecycle module — and its
// require.context over every module's context-menu.ts — into the popup bundle.
export const PENDING_CONTEXT_MENU_KEY = "modules.contextMenu.pending";

export interface PendingContextMenu {
  moduleId: string;
  selection: string;
  ts: number;
}

export function isContextMenuEntry(value: unknown): value is ContextMenuEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.moduleId !== "string") return false;
  if (typeof v.title !== "string") return false;
  if (typeof v.invocation !== "object" || v.invocation === null) return false;
  const inv = v.invocation as Record<string, unknown>;
  if (inv.kind === "popup") return true;
  if (inv.kind === "background" && typeof inv.run === "function") return true;
  return false;
}
