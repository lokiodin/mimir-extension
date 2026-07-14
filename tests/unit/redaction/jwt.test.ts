import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { jwt } from "@/redaction/detectors/jwt";

// Leading "-" keeps it literal inside a regex character class.
const BASE64URL = "-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

describe("jwt detector", () => {
  it("matches a standard signed JWT", () => {
    const tok =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const hits = jwt.detect(`Bearer ${tok}`);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe(tok);
  });

  it("matches an unsigned JWT (alg=none)", () => {
    const tok = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyIn0.";
    expect(jwt.detect(tok)).toHaveLength(1);
  });

  it("does not match a non-eyJ start", () => {
    expect(jwt.detect("aaa.bbb.ccc")).toHaveLength(0);
  });

  it("does not match a single segment", () => {
    expect(jwt.detect("eyJhbGciOiJIUzI1NiJ9")).toHaveLength(0);
  });

  it("property: every well-formed three-segment eyJ token is detected", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(new RegExp(`^[${BASE64URL}]{6,40}$`)),
        fc.stringMatching(new RegExp(`^[${BASE64URL}]{6,40}$`)),
        fc.stringMatching(new RegExp(`^[${BASE64URL}]{0,40}$`)),
        (h, p, s) => {
          const tok = `eyJ${h}.${p}.${s}`;
          const hits = jwt.detect(tok);
          return hits.length === 1 && hits[0].original === tok;
        },
      ),
    );
  });
});
