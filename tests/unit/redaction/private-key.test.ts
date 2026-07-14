import { describe, it, expect } from "vitest";
import { privateKey } from "@/redaction/detectors/private-key";

describe("private-key detector", () => {
  it("matches a generic PEM private key block", () => {
    const text =
      "before\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEA\n-----END PRIVATE KEY-----\nafter";
    const hits = privateKey.detect(text);
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toContain("BEGIN PRIVATE KEY");
    expect(hits[0].original).toContain("END PRIVATE KEY");
  });

  it("matches RSA, OPENSSH, EC variants", () => {
    const variants = [
      "-----BEGIN RSA PRIVATE KEY-----\nbody\n-----END RSA PRIVATE KEY-----",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nbody\n-----END OPENSSH PRIVATE KEY-----",
      "-----BEGIN EC PRIVATE KEY-----\nbody\n-----END EC PRIVATE KEY-----",
    ];
    for (const v of variants) {
      expect(privateKey.detect(v)).toHaveLength(1);
    }
  });

  it("does not match a public key block", () => {
    const text = "-----BEGIN PUBLIC KEY-----\nbody\n-----END PUBLIC KEY-----";
    expect(privateKey.detect(text)).toHaveLength(0);
  });

  it("does not match unbalanced BEGIN without END", () => {
    expect(privateKey.detect("-----BEGIN PRIVATE KEY-----\nno end here"))
      .toHaveLength(0);
  });
});
