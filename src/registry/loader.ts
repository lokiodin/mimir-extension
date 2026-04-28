import type { MimirModule } from "./types";
import placeholder from "@/modules/placeholder";

const modules: Record<string, MimirModule> = {
  [placeholder.id]: placeholder,
};

const CATEGORY_ORDER: ReadonlyArray<string> = [
  "encoding",
  "utilities",
  "cti",
  "analysis",
  "payloads",
];

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
