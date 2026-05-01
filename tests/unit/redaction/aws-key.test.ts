import { describe, it, expect } from "vitest";
import { awsKey } from "@/redaction/detectors/aws-key";

describe("aws-key detector", () => {
  it("matches AKIA long-term access keys", () => {
    const text = "key=AKIAIOSFODNN7EXAMPLE rest";
    const hits = awsKey.detect(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("AKIAIOSFODNN7EXAMPLE");
  });

  it("matches ASIA short-term STS keys", () => {
    const hits = awsKey.detect("ASIAY34FZKBOKMUTVV7A is short-term");
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("ASIAY34FZKBOKMUTVV7A");
  });

  it("matches multiple keys in one document", () => {
    const text = "AKIAIOSFODNN7EXAMPLE and AKIAJ1NLBQDX9YOA0001";
    expect(awsKey.detect(text)).toHaveLength(2);
  });

  it("does not match a non-AWS prefix", () => {
    expect(awsKey.detect("XYZAIOSFODNN7EXAMPLE")).toHaveLength(0);
  });

  it("does not match too-short suffixes", () => {
    expect(awsKey.detect("AKIASHORT")).toHaveLength(0);
  });
});
