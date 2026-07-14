import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { MermaidView } from "@/components/MermaidView";
import { liftLooseMermaid, stripOuterFence } from "@/components/markdown-text";

// Sanitize schema: defaults plus a stricter image src filter (data: only).
// See TECHNICAL_DESIGN.md §10.
const SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [
      ["src", /^data:/],
      "alt",
      "title",
      "width",
      "height",
    ],
  },
};

interface HastNode {
  type: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
  value?: string;
}

function hastTextContent(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text" && typeof node.value === "string") return node.value;
  if (Array.isArray(node.children)) {
    return node.children.map(hastTextContent).join("");
  }
  return "";
}

function classNameList(properties: HastNode["properties"]): string[] {
  const cn = properties?.className;
  if (Array.isArray(cn)) return cn.filter((c): c is string => typeof c === "string");
  if (typeof cn === "string") return cn.split(/\s+/);
  return [];
}

interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  node?: HastNode;
}

const PreBlock: React.FC<PreProps> = ({ node, children, ...rest }) => {
  const child = node?.children?.find((c) => c.type === "element");
  if (child && child.tagName === "code") {
    const classes = classNameList(child.properties);
    const text = hastTextContent(child).replace(/\n+$/, "");
    if (classes.includes("language-mermaid")) {
      return <MermaidView chart={text} />;
    }
    // Suppress empty/whitespace-only fences. Some models emit a stray empty
    // ``` block before/after the actual content; rendering it leaves a bare
    // dark bar.
    if (text.trim() === "") return null;
  }
  return <pre {...rest}>{children}</pre>;
};

export const MarkdownView: React.FC<{ content: string }> = ({ content }) => {
  const cleaned = liftLooseMermaid(stripOuterFence(content));
  return (
    <div className="mimir-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, SCHEMA]]}
        components={{ pre: PreBlock }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
};
