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

// Per-key write mutex. chrome.storage.local has no transactional read-modify-
// write, so concurrent upserts of the same key race: each caller reads the
// same baseline, then last-write wins. The service worker is a singleton, so
// a single in-memory promise chain per key is sufficient to serialize writes.
// Callers wrap their full read+merge+write inside `withStorageLock`.
const storageLocks = new Map<string, Promise<unknown>>();

export function withStorageLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = storageLocks.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  storageLocks.set(
    key,
    next.finally(() => {
      if (storageLocks.get(key) === next) {
        storageLocks.delete(key);
      }
    }),
  );
  return next;
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
