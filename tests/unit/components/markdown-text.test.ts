import { describe, expect, it } from "vitest";
import {
  liftLooseMermaid,
  stripOuterFence,
} from "../../../src/components/markdown-text";

describe("stripOuterFence", () => {
  it("peels a whole-response ```markdown fence", () => {
    const raw = "```markdown\n# Title\n\nBody\n```";
    expect(stripOuterFence(raw)).toBe("# Title\n\nBody");
  });

  it("peels a bare ``` fence", () => {
    expect(stripOuterFence("```\nhello\n```")).toBe("hello");
  });

  it("leaves a language-tagged code fence alone", () => {
    const raw = "```python\nprint(1)\n```";
    expect(stripOuterFence(raw)).toBe(raw);
  });

  it("leaves unfenced text alone", () => {
    expect(stripOuterFence("plain text")).toBe("plain text");
  });
});

describe("liftLooseMermaid", () => {
  it("lifts a bare sequenceDiagram block", () => {
    const raw = "Intro.\n\nsequenceDiagram\n  A->>B: hi";
    expect(liftLooseMermaid(raw)).toBe(
      "Intro.\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```",
    );
  });

  it("lifts flowchart with a direction token", () => {
    const raw = "flowchart TD\n  A-->B";
    expect(liftLooseMermaid(raw)).toBe(
      "```mermaid\nflowchart TD\n  A-->B\n```",
    );
  });

  it("lifts graph with a direction token", () => {
    const raw = "graph LR\n  A-->B";
    expect(liftLooseMermaid(raw)).toBe("```mermaid\ngraph LR\n  A-->B\n```");
  });

  it("does not lift prose starting with 'graph'", () => {
    const raw = "graph theory explains the topology of the botnet.";
    expect(liftLooseMermaid(raw)).toBe(raw);
  });

  it("does not lift prose starting with 'pie' or 'mindmap'", () => {
    const pie = "pie charts are misleading here.";
    const mindmap = "mindmap of the incident: see attachment.";
    expect(liftLooseMermaid(pie)).toBe(pie);
    expect(liftLooseMermaid(mindmap)).toBe(mindmap);
  });

  it("lifts pie when followed by a newline or title", () => {
    const raw = "pie title Verdicts\n  \"clean\": 4";
    expect(liftLooseMermaid(raw)).toBe(
      '```mermaid\npie title Verdicts\n  "clean": 4\n```',
    );
  });

  it("leaves an already-fenced diagram alone", () => {
    const raw = "```mermaid\nsequenceDiagram\n  A->>B: hi\n```";
    expect(liftLooseMermaid(raw)).toBe(raw);
  });

  it("stops the block at a blank line before a heading", () => {
    const raw = "graph TD\n  A-->B\n\n## Next section";
    expect(liftLooseMermaid(raw)).toBe(
      "```mermaid\ngraph TD\n  A-->B\n```\n\n## Next section",
    );
  });
});
