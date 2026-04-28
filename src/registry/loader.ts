import type { MimirModule, ModuleCategory } from "./types";

const CATEGORY_ORDER: ReadonlyArray<ModuleCategory> = [
  "encoding",
  "utilities",
  "cti",
  "analysis",
  "payloads",
];

function isMimirModule(value: unknown): value is MimirModule {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.category === "string" &&
    typeof obj.label === "string" &&
    typeof obj.component === "function"
  );
}

const ctx = require.context("../modules", true, /^\.\/[^/]+\/index\.ts$/);

const modules: Record<string, MimirModule> = {};

for (const key of ctx.keys()) {
  const exported = ctx<{ default: unknown }>(key).default;
  if (isMimirModule(exported)) {
    modules[exported.id] = exported;
  }
}

export function getModules(): MimirModule[] {
  return Object.values(modules).sort((a, b) => {
    const catDiff =
      CATEGORY_ORDER.indexOf(a.category) -
      CATEGORY_ORDER.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return a.label.localeCompare(b.label);
  });
}

export function getModule(id: string): MimirModule | undefined {
  return modules[id];
}
