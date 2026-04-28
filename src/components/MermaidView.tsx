import React from "react";

// Stub: will render Mermaid diagrams with try/catch for syntax errors.
// See TECHNICAL_DESIGN.md §10.

export const MermaidView: React.FC<{ chart: string }> = ({ chart }) => {
  return React.createElement("pre", null, chart);
};
