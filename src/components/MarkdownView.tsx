import React from "react";

// Stub: will render Markdown via react-markdown + rehype-sanitize.
// See TECHNICAL_DESIGN.md §10.

export const MarkdownView: React.FC<{ content: string }> = ({ content }) => {
  return React.createElement("div", { className: "prose" }, content);
};
