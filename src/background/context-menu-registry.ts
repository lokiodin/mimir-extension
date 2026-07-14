// SW-side context-menu registry loader.
// Walks src/modules/*/context-menu.ts at webpack build time so the service
// worker bundle gets the entries without pulling in module React components.
// See TECHNICAL_DESIGN.md §4.3.

import { isContextMenuEntry, type ContextMenuEntry } from "@/registry/context-menu-types";

const ctx = require.context(
  "../modules",
  true,
  /^\.\/[^/]+\/context-menu\.ts$/,
);

const entries: Record<string, ContextMenuEntry> = {};

for (const key of ctx.keys()) {
  const exported = ctx<{ default: unknown }>(key).default;
  if (isContextMenuEntry(exported)) {
    entries[exported.moduleId] = exported;
  }
}

export function getContextMenuEntries(): ContextMenuEntry[] {
  return Object.values(entries);
}

export function getContextMenuEntry(
  moduleId: string,
): ContextMenuEntry | undefined {
  return entries[moduleId];
}
