// Adapter registry. The dispatcher in src/background/ai-client.ts looks up
// the active provider's adapter here; nothing else in the codebase should
// import individual adapter files.

import type { AiProviderConfig } from "@/storage/types";
import type { AiAdapter } from "./types";
import aiyou from "./aiyou";
import anthropic from "./anthropic";
import ollama from "./ollama";
import openai from "./openai";
import openaiCompatible from "./openai-compatible";

export const adapters: Readonly<Record<AiProviderConfig["type"], AiAdapter>> = {
  ollama,
  openai,
  "openai-compatible": openaiCompatible,
  anthropic,
  aiyou,
};

export type {
  AiAdapter,
  AiAdapterRequest,
  AiAdapterTestRequest,
  AiAdapterCompleteResult,
  AiAdapterTestResult,
  AiAdapterError,
  AiAdapterErrorKind,
} from "./types";
