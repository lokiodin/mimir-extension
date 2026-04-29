// Prompt resolution: two-layer lookup (user override → built-in default).

import { getPrompt } from "@/storage/manager";
import { PROMPT_DEFAULTS } from "@/prompts/defaults";

export async function resolvePrompt(featureId: string): Promise<string> {
  const override = await getPrompt(featureId);
  if (override !== undefined && override.trim() !== "") {
    return override;
  }
  return PROMPT_DEFAULTS[featureId] ?? "";
}
