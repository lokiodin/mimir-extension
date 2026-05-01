import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { mac } from "@/redaction/detectors/mac";

describe("mac detector", () => {
  it("matches colon-separated addresses", () => {
    const hits = mac.detect("Adapter 00:1A:2B:3C:4D:5E reports up");
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("00:1A:2B:3C:4D:5E");
  });

  it("matches dash-separated addresses", () => {
    const hits = mac.detect("Adapter 00-1A-2B-3C-4D-5E reports up");
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe("00-1A-2B-3C-4D-5E");
  });

  it("rejects too-few groups", () => {
    expect(mac.detect("00:1A:2B:3C:4D")).toHaveLength(0);
  });

  it("property: any random 6-octet sequence with : separator matches", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 6,
          maxLength: 6,
        }),
        (octets) => {
          const m = octets
            .map((o) => o.toString(16).padStart(2, "0"))
            .join(":");
          const hits = mac.detect(`mac=${m} end`);
          return hits.length === 1 && hits[0].original === m;
        },
      ),
    );
  });
});
