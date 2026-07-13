// Pure text pre-processing for MarkdownView. No React/mermaid imports so
// the heuristics stay unit-testable without pulling in the renderers.

// Some models wrap the entire response in a single ```markdown ... ``` fence
// despite the system prompt asking them not to. Peel it once if present so
// the body is parsed as Markdown rather than rendered as a code block.
export function stripOuterFence(raw: string): string {
  const text = raw.trim();
  const match = text.match(/^```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)\r?\n```$/);
  if (!match) return raw;
  const lang = match[1].toLowerCase();
  if (lang === "" || lang === "markdown" || lang === "md") {
    return match[2];
  }
  return raw;
}

const FENCE = "```";

// Last-resort fallback: if the model produced a raw diagram outside a code
// fence, lift the block into a fenced mermaid block so the renderer can pick
// it up. Keywords that double as English words need corroborating syntax so
// prose like "graph theory shows..." or "mindmap of the incident" is left
// alone:
//   - graph/flowchart must be followed by a direction token (mermaid
//     requires one anyway);
//   - pie/journey/mindmap must be followed by a newline (or pie's
//     title/showData directives).
// CamelCase diagram keywords are distinctive enough on their own.
const MERMAID_HEADER =
  "(?:sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt)\\b" +
  "|(?:graph|flowchart)[ \\t]+(?:TB|TD|BT|RL|LR)\\b" +
  "|pie(?=[ \\t]*\\n|[ \\t]+title\\b|[ \\t]+showData\\b)" +
  "|journey(?=[ \\t]*\\n|[ \\t]+title\\b)" +
  "|mindmap(?=[ \\t]*\\n)";

// Match an unfenced diagram block: a header at line start, followed by body
// lines, ending at a blank-line + heading, blank-line + fence, or EOF.
const LOOSE_MERMAID_RE = new RegExp(
  "(^|\\n)(" +
    MERMAID_HEADER +
    ")([\\s\\S]*?)(?=\\n{2,}#{1,6}\\s|\\n{2,}" +
    FENCE +
    "|$)",
  "g",
);

export function liftLooseMermaid(raw: string): string {
  return raw.replace(
    LOOSE_MERMAID_RE,
    (match, prefix: string, kw: string, body: string, offset: number) => {
      // Skip if already inside a fence: count fence markers before this match.
      const before = raw.slice(0, offset);
      const fenceCount = (before.match(/```/g) ?? []).length;
      if (fenceCount % 2 === 1) return match;
      const trimmed = body.replace(/\s+$/, "");
      return prefix + FENCE + "mermaid\n" + kw + trimmed + "\n" + FENCE;
    },
  );
}
