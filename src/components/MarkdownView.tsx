import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { MermaidView } from "@/components/MermaidView";

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

// Some models wrap the entire response in a single ```markdown ... ``` fence
// despite the system prompt asking them not to. Peel it once if present so
// the body is parsed as Markdown rather than rendered as a code block.
function stripOuterFence(raw: string): string {
  const text = raw.trim();
  const match = text.match(/^```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)\r?\n```$/);
  if (!match) return raw;
  const lang = match[1].toLowerCase();
  if (lang === "" || lang === "markdown" || lang === "md") {
    return match[2];
  }
  return raw;
}

// Last-resort fallback: if the model produced raw "sequenceDiagram" /
// "flowchart" / "graph" / "classDiagram" / "stateDiagram" text outside a
// code fence, lift the block into a fenced mermaid block so the renderer
// can pick it up.
const FENCE = "```";
const MERMAID_KEYWORDS = [
  "sequenceDiagram",
  "flowchart",
  "graph",
  "classDiagram",
  "stateDiagram-v2",
  "stateDiagram",
  "erDiagram",
  "gantt",
  "journey",
  "pie",
  "mindmap",
];

function liftLooseMermaid(raw: string): string {
  const kwAlt = MERMAID_KEYWORDS.join("|");
  // Match an unfenced diagram block: a keyword at line start, followed by
  // body lines, ending at a blank-line + heading, blank-line + fence, or EOF.
  const pattern = new RegExp(
    "(^|\\n)(" + kwAlt + ")\\b([\\s\\S]*?)(?=\\n{2,}#{1,6}\\s|\\n{2,}" + FENCE + "|$)",
    "g",
  );
  return raw.replace(pattern, (match, prefix: string, kw: string, body: string, offset: number) => {
    // Skip if already inside a fence: count unescaped fence markers before this match.
    const before = raw.slice(0, offset);
    const fenceCount = (before.match(/```/g) ?? []).length;
    if (fenceCount % 2 === 1) return match;
    const trimmed = body.replace(/\s+$/, "");
    return prefix + FENCE + "mermaid\n" + kw + trimmed + "\n" + FENCE;
  });
}

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
    if (classes.includes("language-mermaid")) {
      const chart = hastTextContent(child).replace(/\n+$/, "");
      return <MermaidView chart={chart} />;
    }
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
