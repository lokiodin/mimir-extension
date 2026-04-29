import React from "react";
import { TextTransformPanel } from "@/components/TextTransformPanel";
import { OPERATIONS } from "@/modules/defang/operations";

export const DefangComponent: React.FC = () => {
  return (
    <TextTransformPanel
      transforms={OPERATIONS}
      defaultTransformId="defang"
      bidirectional
    />
  );
};
