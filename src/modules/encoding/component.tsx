import React, { useEffect, useRef, useState } from "react";
import { OPERATIONS, type OperationId } from "@/modules/encoding/operations";
import { storageGet, storageSet } from "@/storage/manager";
import {
  TextTransformPanel,
  type TextTransform,
} from "@/components/TextTransformPanel";
import { useMimirStore } from "@/store";

const STORAGE_KEY = "modules.encoding";
const PERSIST_DEBOUNCE_MS = 250;

interface PersistedState {
  operationId: OperationId;
  input: string;
}

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.input !== "string") return false;
  if (typeof v.operationId !== "string") return false;
  return OPERATIONS.some((o) => o.id === v.operationId);
}

const TRANSFORMS: ReadonlyArray<TextTransform> = OPERATIONS.map((o) => ({
  id: o.id,
  label: o.label,
  group: o.group,
  fn: o.fn,
}));

export const EncodingComponent: React.FC = () => {
  const [operationId, setOperationId] = useState<OperationId>("base64-encode");
  const [input, setInput] = useState<string>("");
  const [hydrated, setHydrated] = useState<boolean>(false);
  const persistTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    storageGet<unknown>(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (isPersistedState(raw)) {
          setOperationId(raw.operationId);
          setInput(raw.input);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current);
    }
    persistTimer.current = window.setTimeout(() => {
      void storageSet(STORAGE_KEY, {
        operationId,
        input,
      } satisfies PersistedState);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
    };
  }, [hydrated, operationId, input]);

  const pendingInput = useMimirStore((s) => s.pendingInput);
  const setPendingInput = useMimirStore((s) => s.setPendingInput);
  useEffect(() => {
    if (!hydrated) return;
    if (pendingInput?.moduleId !== "encoding") return;
    setInput(pendingInput.value);
    setPendingInput(null);
  }, [hydrated, pendingInput, setPendingInput]);

  return (
    <TextTransformPanel
      transforms={TRANSFORMS}
      value={input}
      onValueChange={setInput}
      transformId={operationId}
      onTransformIdChange={(id) => setOperationId(id as OperationId)}
    />
  );
};
