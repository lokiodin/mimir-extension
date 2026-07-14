import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getSettings,
  requestSettingsUpdate,
  getApiKey,
} from "@/storage/manager";
import type { Settings } from "@/storage/types";

// Per-key revision store. A single `chrome.storage.onChanged` listener fans
// out to subscribers by key, so a `settings` write doesn't bounce every
// `useApiKey` consumer through a loading state (and vice versa).
interface KeyRevisionStore {
  get(key: string): number;
  subscribe(key: string, listener: () => void): () => void;
}

function createKeyRevisionStore(): KeyRevisionStore {
  const revisions = new Map<string, number>();
  const listeners = new Map<string, Set<() => void>>();

  chrome.storage.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      const set = listeners.get(key);
      if (set) {
        for (const fn of set) fn();
      }
    }
  });

  return {
    get(key) {
      return revisions.get(key) ?? 0;
    },
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set && set.size === 0) {
          listeners.delete(key);
        }
      };
    },
  };
}

const StorageContext = createContext<KeyRevisionStore | null>(null);

export const StorageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const store = useMemo(() => createKeyRevisionStore(), []);
  return (
    <StorageContext.Provider value={store}>{children}</StorageContext.Provider>
  );
};

function useStore(): KeyRevisionStore {
  const store = useContext(StorageContext);
  if (!store) {
    throw new Error("StorageProvider missing — wrap your app in <StorageProvider>");
  }
  return store;
}

// Subscribes to changes for a single storage key. Returns an opaque counter
// bumped only when that specific key changes.
export function useStorageKey(key: string): number {
  const store = useStore();
  return useSyncExternalStore(
    (listener) => store.subscribe(key, listener),
    () => store.get(key),
  );
}

// Returns [settings, updateSettings, loading].
export function useSettings(): [
  Settings | null,
  (patch: Partial<Settings>) => Promise<void>,
  boolean,
] {
  const revision = useStorageKey("settings");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSettings()
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const handleUpdate = async (patch: Partial<Settings>): Promise<void> => {
    // Routed through the SW — the settings key is single-writer (TD §9).
    await requestSettingsUpdate(patch);
  };

  return [settings, handleUpdate, loading];
}

// Returns [apiKey, setApiKey, loading]. Subscribes only to its own key.
export function useApiKey(
  provider: string,
): [string | null, (key: string) => Promise<void>, boolean] {
  const revision = useStorageKey(`apikeys.${provider}`);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getApiKey(provider)
      .then((key) => {
        if (!cancelled) {
          setApiKey(key ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiKey(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [revision, provider]);

  const handleSetApiKey = async (key: string): Promise<void> => {
    const { setApiKey: setStorageKey } = await import("@/storage/manager");
    await setStorageKey(provider, key);
  };

  return [apiKey, handleSetApiKey, loading];
}
