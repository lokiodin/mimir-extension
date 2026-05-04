import React, { useEffect, useState } from "react";
import { TextTransformPanel } from "@/components/TextTransformPanel";
import { OPERATIONS } from "@/modules/defang/operations";
import { useMimirStore } from "@/store";

export const DefangComponent: React.FC = () => {
  const [input, setInput] = useState<string>("");

  const pendingInput = useMimirStore((s) => s.pendingInput);
  const setPendingInput = useMimirStore((s) => s.setPendingInput);
  useEffect(() => {
    if (pendingInput?.moduleId !== "defang") return;
    setInput(pendingInput.value);
    setPendingInput(null);
  }, [pendingInput, setPendingInput]);

  return (
    <TextTransformPanel
      transforms={OPERATIONS}
      defaultTransformId="defang"
      bidirectional
      value={input}
      onValueChange={setInput}
    />
  );
};
