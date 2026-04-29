import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getSettings,
  updateSettings,
  getApiKey,
} from "@/storage/manager";
import type { Settings } from "@/storage/types";

interface StorageContextValue {
  // Opaque revision counter bumped on any storage change.
  // Components subscribe to this and re-fetch as needed.
  revision: number;
}

const StorageContext = createContext<StorageContextValue>({ revision: 0 });

export const StorageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const listener = () => {
      setRevision((r) => r + 1);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const value = useMemo(() => ({ revision }), [revision]);
  return (
    <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
  );
};

export function useStorageRevision(): number {
  return useContext(StorageContext).revision;
}

// Returns [settings, updateSettings, loading].
// Subscribes to storage changes via revision; re-fetches when storage changes.
export function useSettings(): [
  Settings | null,
  (patch: Partial<Settings>) => Promise<void>,
  boolean,
] {
  const revision = useStorageRevision();
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
    await updateSettings(patch);
  };

  return [settings, handleUpdate, loading];
}

// Returns [apiKey, setApiKey, loading].
// Subscribes to storage changes via revision; re-fetches when storage changes.
export function useApiKey(
  provider: string,
): [string | null, (key: string) => Promise<void>, boolean] {
  const revision = useStorageRevision();
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
