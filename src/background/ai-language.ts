// French output directive appended to the resolved system prompt in
// complete() (ai-client.ts). Plain text only — no custom prompt tags
// (AGENTS.md §6). English appends nothing; the built-in prompts are
// already English.

import type { AnalysisLanguage } from "@/storage/types";

export const FRENCH_DIRECTIVE =
  "\n\nWrite your entire response in French, including all section titles. " +
  "Do NOT translate technical or ambiguous terms: keep log field names, " +
  "commands, protocols, HTTP methods, status codes, tool/product names, " +
  "file paths, usernames, hostnames, IoCs, and established IT/security " +
  "jargon in their original English form. Translate only the explanatory " +
  "prose around them.";

export function applyLanguageDirective(
  system: string,
  language: AnalysisLanguage | undefined,
): string {
  if (language === "fr") return system + FRENCH_DIRECTIVE;
  return system;
}
