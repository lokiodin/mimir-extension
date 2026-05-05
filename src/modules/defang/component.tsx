import React, { useEffect, useId, useState } from "react";
import { CopyIconButton } from "@/components/CopyIconButton";
import { defangAll, refangAll } from "@/modules/defang/operations";
import { useMimirStore } from "@/store";

const REFANG_HINT = /\[\.\]|hxxp/i;

const TEXTAREA_CLASS =
  "flex-1 min-h-[6rem] resize-none bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 pr-8 font-mono text-sm focus:outline-none focus:border-gray-500";

export const DefangComponent: React.FC = () => {
  const baseId = useId();
  const fangedId = `${baseId}-fanged`;
  const defangedId = `${baseId}-defanged`;

  const [fanged, setFanged] = useState<string>("");
  const [defanged, setDefanged] = useState<string>("");

  const pendingInput = useMimirStore((s) => s.pendingInput);
  const setPendingInput = useMimirStore((s) => s.setPendingInput);
  useEffect(() => {
    if (pendingInput?.moduleId !== "defang") return;
    const v = pendingInput.value;
    if (REFANG_HINT.test(v)) {
      setDefanged(v);
      setFanged(refangAll(v));
    } else {
      setFanged(v);
      setDefanged(defangAll(v));
    }
    setPendingInput(null);
  }, [pendingInput, setPendingInput]);

  const onFangedChange = (v: string): void => {
    setFanged(v);
    setDefanged(defangAll(v));
  };
  const onDefangedChange = (v: string): void => {
    setDefanged(v);
    setFanged(refangAll(v));
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col flex-1 min-h-0 gap-1">
        <label htmlFor={fangedId} className="text-xs text-gray-400">
          Fanged
        </label>
        <div className="relative flex-1 min-h-0 flex">
          <textarea
            id={fangedId}
            value={fanged}
            onChange={(e) => onFangedChange(e.target.value)}
            spellCheck={false}
            className={TEXTAREA_CLASS}
          />
          {fanged !== "" && (
            <CopyIconButton text={fanged} label="Copy fanged" />
          )}
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 gap-1">
        <label htmlFor={defangedId} className="text-xs text-gray-400">
          Defanged
        </label>
        <div className="relative flex-1 min-h-0 flex">
          <textarea
            id={defangedId}
            value={defanged}
            onChange={(e) => onDefangedChange(e.target.value)}
            spellCheck={false}
            className={TEXTAREA_CLASS}
          />
          {defanged !== "" && (
            <CopyIconButton text={defanged} label="Copy defanged" />
          )}
        </div>
      </div>
    </div>
  );
};
