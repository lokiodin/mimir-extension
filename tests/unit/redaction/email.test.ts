import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { email } from "@/redaction/detectors/email";

describe("email detector", () => {
  it.each([
    "alice@example.com",
    "bob.smith+tag@sub.example.co.uk",
    "carol_42@example.io",
  ])("matches %s", (e) => {
    const hits = email.detect(`contact ${e} please`);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe(e);
  });

  it("does not match obviously broken inputs", () => {
    expect(email.detect("no-at-sign.example.com")).toHaveLength(0);
    expect(email.detect("@example.com")).toHaveLength(0);
    expect(email.detect("user@")).toHaveLength(0);
    expect(email.detect("user@.com")).toHaveLength(0);
  });

  it("property: alnum local + alnum host + 2-letter TLD always matches", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
        fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
        fc.stringMatching(/^[a-z]{2,8}$/),
        (local, host, tld) => {
          const e = `${local}@${host}.${tld}`;
          const hits = email.detect(`mail: ${e}.`);
          return hits.length === 1 && hits[0].original === e;
        },
      ),
    );
  });
});
