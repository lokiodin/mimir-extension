// StorageManager — single facade over chrome.storage.local.
// See TECHNICAL_DESIGN.md §9.
// All chrome.storage.local access goes through this module.

import type { Settings } from "@/storage/types";
import { DEFAULT_SETTINGS } from "@/storage/types";

const SETTINGS_KEY = "settings";

export async function storageGet<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function storageRemove(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

// Settings helpers (typed, namespaced under 'settings' key)
export async function getSettings(): Promise<Settings> {
  const stored = await storageGet<Partial<Settings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await storageSet(SETTINGS_KEY, updated);
}

// API key helpers (namespaced under 'apikeys.*')
export async function getApiKey(provider: string): Promise<string | undefined> {
  return storageGet<string>(`apikeys.${provider}`);
}

export async function setApiKey(
  provider: string,
  key: string,
): Promise<void> {
  await storageSet(`apikeys.${provider}`, key);
}

export async function removeApiKey(provider: string): Promise<void> {
  await storageRemove(`apikeys.${provider}`);
}

// Prompt helpers (namespaced under 'prompts.*')
export async function getPrompt(featureId: string): Promise<string | undefined> {
  return storageGet<string>(`prompts.${featureId}`);
}

export async function setPrompt(
  featureId: string,
  prompt: string,
): Promise<void> {
  await storageSet(`prompts.${featureId}`, prompt);
}

export async function removePrompt(featureId: string): Promise<void> {
  await storageRemove(`prompts.${featureId}`);
}
