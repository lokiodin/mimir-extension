// Generates the labeled corpus under cases/. Run with `tsx`:
//   pnpm tsx tests/redaction-corpus/generate.ts
//
// Produces one JSON file per case. Offsets are computed at generation time
// from the supplied substrings to remove human counting errors.

import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ExpectedSpec {
  type: string;
  needle: string; // substring of `input` whose first occurrence is the detection
  occurrence?: number; // 0 = first (default), 1 = second, ...
}

interface CaseSpec {
  id: string;
  source: "synthesized" | "ctf-public" | "ir-public" | "synthetic-test";
  input: string;
  expected: ExpectedSpec[];
  cite?: string;
}

function findNthIndex(haystack: string, needle: string, n: number): number {
  let from = 0;
  for (let i = 0; i <= n; i++) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return -1;
    if (i === n) return idx;
    from = idx + 1;
  }
  return -1;
}

function compileCase(spec: CaseSpec): unknown {
  const expected = spec.expected.map((e) => {
    const occ = e.occurrence ?? 0;
    const start = findNthIndex(spec.input, e.needle, occ);
    if (start === -1) {
      throw new Error(
        `Case ${spec.id}: needle ${JSON.stringify(e.needle)} (occurrence ${occ}) not found in input`,
      );
    }
    return {
      type: e.type,
      start,
      end: start + e.needle.length,
      original: e.needle,
    };
  });
  const out: Record<string, unknown> = {
    id: spec.id,
    source: spec.source,
    input: spec.input,
    expected,
  };
  if (spec.cite) out.cite = spec.cite;
  return out;
}

const CASES: CaseSpec[] = [
  // === IPv4 ===
  {
    id: "ipv4-001-ssh-failed",
    source: "synthesized",
    input:
      "Aug 12 10:32:01 webhost sshd[2453]: Failed password for invalid user admin from 203.0.113.42 port 51823 ssh2",
    expected: [{ type: "ipv4", needle: "203.0.113.42" }],
  },
  {
    id: "ipv4-002-access-log",
    source: "synthesized",
    input:
      '198.51.100.7 - - [10/Oct/2023:13:55:36 -0700] "GET /admin HTTP/1.1" 401 287',
    expected: [{ type: "ipv4", needle: "198.51.100.7" }],
  },
  {
    id: "ipv4-003-multiple",
    source: "synthesized",
    input: "src=10.0.0.1 dst=192.168.1.50 via gateway 172.16.0.1",
    expected: [
      { type: "ipv4", needle: "10.0.0.1" },
      { type: "ipv4", needle: "192.168.1.50" },
      { type: "ipv4", needle: "172.16.0.1" },
    ],
  },
  {
    id: "ipv4-004-end-of-sentence",
    source: "synthesized",
    input: "The attacker connected from 1.2.3.4. We blocked them.",
    expected: [{ type: "ipv4", needle: "1.2.3.4" }],
  },
  {
    id: "ipv4-005-bounds",
    source: "synthesized",
    input: "Edge cases: 0.0.0.0 and 255.255.255.255 should both match.",
    expected: [
      { type: "ipv4", needle: "0.0.0.0" },
      { type: "ipv4", needle: "255.255.255.255" },
    ],
  },
  {
    id: "ipv4-neg-001-version",
    source: "synthesized",
    input: "Running version 10.2.13.4 of the agent.",
    // 10.2.13.4 IS a valid dotted-quad shape — the detector flags it. Stage 3
    // is where the user rejects it as a version string. We don't try to
    // distinguish version strings from IPs at the regex level.
    expected: [{ type: "ipv4", needle: "10.2.13.4" }],
  },
  {
    id: "ipv4-neg-002-octet-too-large",
    source: "synthesized",
    input: "Misconfigured 999.0.0.1 should not match.",
    expected: [],
  },

  // === IPv6 ===
  {
    id: "ipv6-001-full",
    source: "synthesized",
    input:
      "Connection from 2001:0db8:0000:0042:0000:8a2e:0370:7334 was rejected.",
    expected: [
      {
        type: "ipv6",
        needle: "2001:0db8:0000:0042:0000:8a2e:0370:7334",
      },
    ],
  },
  {
    id: "ipv6-002-compressed",
    source: "synthesized",
    input: "router LSA from 2001:db8::ff00:42:8329 announced",
    expected: [{ type: "ipv6", needle: "2001:db8::ff00:42:8329" }],
  },
  {
    id: "ipv6-003-loopback",
    source: "synthesized",
    input: "bind ::1 port 8080 inside container",
    expected: [{ type: "ipv6", needle: "::1" }],
  },
  {
    id: "ipv6-004-link-local",
    source: "synthesized",
    input: "link-local fe80::1ff:fe23:4567:890a discovered",
    expected: [{ type: "ipv6", needle: "fe80::1ff:fe23:4567:890a" }],
  },

  // === Email ===
  {
    id: "email-001-simple",
    source: "synthesized",
    input: "Please reach out to alice@example.com for details.",
    expected: [{ type: "email", needle: "alice@example.com" }],
  },
  {
    id: "email-002-plus-tag",
    source: "synthesized",
    input: "Sent invoice to billing+receipts@company.io yesterday.",
    expected: [{ type: "email", needle: "billing+receipts@company.io" }],
  },
  {
    id: "email-003-multi",
    source: "synthesized",
    input:
      "Cc: bob@corp.com, carol.smith@sub.example.co, dave_42@team.dev — please review.",
    expected: [
      { type: "email", needle: "bob@corp.com" },
      { type: "email", needle: "carol.smith@sub.example.co" },
      { type: "email", needle: "dave_42@team.dev" },
    ],
  },
  {
    id: "email-004-in-log",
    source: "ir-public",
    input:
      "Mailgun bounce: 550 5.4.1 Recipient address rejected: <attacker@malicious.gov>",
    expected: [{ type: "email", needle: "attacker@malicious.gov" }],
  },
  {
    id: "email-neg-001",
    source: "synthesized",
    input: "Reach me at no-at-sign.example.com or call directly.",
    // Not an email (no @), but it IS a valid FQDN shape — Stage 1 catches it.
    // Negative coverage is for the email detector specifically.
    expected: [{ type: "fqdn", needle: "no-at-sign.example.com" }],
  },

  // === FQDN ===
  {
    id: "fqdn-001-c2-domain",
    source: "synthesized",
    input: "Beacon to evil-c2.example.com observed in pcap.",
    expected: [{ type: "fqdn", needle: "evil-c2.example.com" }],
  },
  {
    id: "fqdn-002-multi-subdomain",
    source: "synthesized",
    input: "Resolved api.staging.internal.dev to 10.0.0.42",
    expected: [
      { type: "fqdn", needle: "api.staging.internal.dev" },
      { type: "ipv4", needle: "10.0.0.42" },
    ],
  },
  {
    id: "fqdn-003-with-tld-suspicious",
    source: "synthesized",
    input: "Phishing landing at login-portal.tk",
    expected: [],
    // login-portal.tk — .tk is not in our short TLD list. A user can add it
    // manually in Stage 3 if needed. This case asserts we don't false-positive
    // an aggressive TLD list.
  },
  {
    id: "fqdn-neg-001-version",
    source: "synthesized",
    input: "Library updated 1.2.3.release on 2024-01-01",
    expected: [],
  },

  // === AWS access key ===
  {
    id: "awskey-001-akia",
    source: "synthesized",
    input:
      "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n",
    expected: [
      { type: "aws access key", needle: "AKIAIOSFODNN7EXAMPLE" },
      // The secret key is caught by the high-entropy detector — it's not a
      // structurally identifiable AWS prefix, but the entropy heuristic
      // legitimately flags it.
      {
        type: "high entropy",
        needle: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
    ],
  },
  {
    id: "awskey-002-asia-sts",
    source: "synthesized",
    input: "Credentials issued by STS: ASIAY34FZKBOKMUTVV7A (expires soon)",
    expected: [{ type: "aws access key", needle: "ASIAY34FZKBOKMUTVV7A" }],
  },
  {
    id: "awskey-003-pair-in-prose",
    source: "ir-public",
    input:
      "We rotated AKIAJ1NLBQDX9YOA0001 and AKIAJ1NLBQDX9YOA0002 after the leak.",
    expected: [
      { type: "aws access key", needle: "AKIAJ1NLBQDX9YOA0001" },
      { type: "aws access key", needle: "AKIAJ1NLBQDX9YOA0002" },
    ],
  },

  // === GitHub token ===
  {
    id: "ghtoken-001-https",
    source: "synthesized",
    input:
      "git clone https://oauth2:ghp_abc1234567890abc1234567890abc1234567@github.com/org/repo.git",
    expected: [
      {
        type: "github token",
        needle: "ghp_abc1234567890abc1234567890abc1234567",
      },
      { type: "fqdn", needle: "github.com" },
    ],
  },
  {
    id: "ghtoken-002-server",
    source: "synthesized",
    input: "Server token leaked: ghs_qzxw1234567890qzxw1234567890qzxw123456",
    expected: [
      {
        type: "github token",
        needle: "ghs_qzxw1234567890qzxw1234567890qzxw123456",
      },
    ],
  },

  // === JWT ===
  {
    id: "jwt-001-bearer",
    source: "synthesized",
    input:
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    expected: [
      {
        type: "jwt",
        needle:
          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      },
    ],
  },
  {
    id: "jwt-002-cookie",
    source: "synthesized",
    input:
      "Set-Cookie: session=eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE2MzQ1Njc4OTB9.SignaturePartHere; Path=/",
    expected: [
      {
        type: "jwt",
        needle:
          "eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE2MzQ1Njc4OTB9.SignaturePartHere",
      },
    ],
  },

  // === Bearer token ===
  {
    id: "bearer-001-opaque",
    source: "synthesized",
    input:
      "curl -H 'Authorization: Bearer abc123def456ghi789jkl0mnopqrstuvwxyz' https://api.service.io/v1/me",
    expected: [
      { type: "bearer token", needle: "abc123def456ghi789jkl0mnopqrstuvwxyz" },
      { type: "fqdn", needle: "api.service.io" },
    ],
  },

  // === Private key block ===
  {
    id: "privatekey-001-rsa",
    source: "synthesized",
    input: `User dump:
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
-----END RSA PRIVATE KEY-----
done.`,
    expected: [
      {
        type: "private key block",
        needle: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
-----END RSA PRIVATE KEY-----`,
      },
    ],
  },
  {
    id: "privatekey-002-openssh",
    source: "synthesized",
    input: `Backup of id_ed25519:
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
c2gtZWQyNTUxOQAAACDdGtbeXEoXLZc8DH+xnD3UXBNlJjkCfvRjUHFBVBBFAQAA
-----END OPENSSH PRIVATE KEY-----`,
    expected: [
      {
        type: "private key block",
        needle: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
c2gtZWQyNTUxOQAAACDdGtbeXEoXLZc8DH+xnD3UXBNlJjkCfvRjUHFBVBBFAQAA
-----END OPENSSH PRIVATE KEY-----`,
      },
    ],
  },

  // === MAC ===
  {
    id: "mac-001-arp",
    source: "synthesized",
    input: "ARP entry: 192.168.1.10 -> 00:1A:2B:3C:4D:5E (eth0)",
    expected: [
      { type: "ipv4", needle: "192.168.1.10" },
      { type: "mac address", needle: "00:1A:2B:3C:4D:5E" },
    ],
  },
  {
    id: "mac-002-dhcp",
    source: "synthesized",
    input: "DHCPACK on 10.10.10.50 to 0a-1b-2c-3d-4e-5f via eth1",
    expected: [
      { type: "ipv4", needle: "10.10.10.50" },
      { type: "mac address", needle: "0a-1b-2c-3d-4e-5f" },
    ],
  },

  // === User paths ===
  {
    id: "userpath-001-macos",
    source: "synthesized",
    input: "Saved at /Users/alice/Documents/leaked.txt for review",
    expected: [{ type: "user path", needle: "alice" }],
  },
  {
    id: "userpath-002-linux",
    source: "synthesized",
    input: "Working dir was /home/bob/projects/internal-tool",
    expected: [{ type: "user path", needle: "bob" }],
  },
  {
    id: "userpath-003-windows",
    source: "synthesized",
    input: "Loaded from C:\\Users\\carol\\AppData\\Local\\Temp\\",
    expected: [{ type: "user path", needle: "carol" }],
  },
  {
    id: "userpath-neg-001-shared",
    source: "synthesized",
    input: "/Users/Shared/CommonResources is global, not personal.",
    expected: [],
  },

  // === UUID / high entropy ===
  {
    id: "uuid-001-v4",
    source: "synthesized",
    input:
      "Trace id 550e8400-e29b-41d4-a716-446655440000 captured for the failure.",
    expected: [
      { type: "uuid", needle: "550e8400-e29b-41d4-a716-446655440000" },
    ],
  },
  {
    id: "uuid-002-multi",
    source: "synthesized",
    input:
      "Spans: 6fa459ea-ee8a-3ca4-894e-db77e160355e and 12345678-1234-5234-9234-123456789abc",
    expected: [
      { type: "uuid", needle: "6fa459ea-ee8a-3ca4-894e-db77e160355e" },
      { type: "uuid", needle: "12345678-1234-5234-9234-123456789abc" },
    ],
  },
  {
    id: "highentropy-001-api-key",
    source: "synthesized",
    input:
      "API_KEY=aB3xY7zQ9mNvR2sLpKj8FdGhWqEr4Tu5 deployed to staging.",
    expected: [
      { type: "high entropy", needle: "aB3xY7zQ9mNvR2sLpKj8FdGhWqEr4Tu5" },
    ],
  },

  // === Combined / realistic ===
  {
    id: "combo-001-incident-snippet",
    source: "ir-public",
    input: `Incident: alice@corp.com reported anomalous logins from 203.0.113.42 starting 2024-01-15. Forwarded to soc@corp.com.`,
    expected: [
      { type: "email", needle: "alice@corp.com" },
      { type: "ipv4", needle: "203.0.113.42" },
      { type: "email", needle: "soc@corp.com" },
    ],
  },
  {
    id: "combo-002-shell-history",
    source: "ctf-public",
    input: `$ ssh ec2-user@10.0.5.12
$ export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
$ curl -H "Authorization: Bearer ghp_abc1234567890abc1234567890abc1234567" https://api.github.com/user`,
    expected: [
      { type: "ipv4", needle: "10.0.5.12" },
      { type: "aws access key", needle: "AKIAIOSFODNN7EXAMPLE" },
      {
        type: "github token",
        needle: "ghp_abc1234567890abc1234567890abc1234567",
      },
      { type: "fqdn", needle: "api.github.com" },
    ],
  },
  {
    id: "combo-003-error-trace",
    source: "synthesized",
    input: `TypeError at /Users/dave/app/index.js:42
  request to https://internal.dev/api failed
  uuid=550e8400-e29b-41d4-a716-446655440001`,
    expected: [
      { type: "user path", needle: "dave" },
      { type: "fqdn", needle: "internal.dev" },
      { type: "uuid", needle: "550e8400-e29b-41d4-a716-446655440001" },
    ],
  },
  {
    id: "combo-004-mail-trace",
    source: "synthesized",
    input:
      "Received from mail.example.com (1.2.3.4) by relay.corp.com for alice@corp.com",
    expected: [
      { type: "fqdn", needle: "mail.example.com" },
      { type: "ipv4", needle: "1.2.3.4" },
      { type: "fqdn", needle: "relay.corp.com" },
      { type: "email", needle: "alice@corp.com" },
    ],
  },

  // === Negative coverage (no detections expected) ===
  {
    id: "negative-001-prose",
    source: "synthesized",
    input:
      "The quick brown fox jumped over the lazy dog. Nothing sensitive here.",
    expected: [],
  },
  {
    id: "negative-002-numbers",
    source: "synthesized",
    input: "Order #45872 placed at 3:14pm for $19.95 (qty 2).",
    expected: [],
  },
  {
    id: "negative-003-code",
    source: "synthesized",
    input: "for (let i = 0; i < 256; i++) { hash[i] = (hash[i] >> 4) & 0xff; }",
    expected: [],
  },

  // === Synthesized sweep — additional coverage ===
  {
    id: "sweep-001-ipv4-private",
    source: "synthesized",
    input: "RFC1918 192.168.0.1 and 10.255.255.254 are commonly internal.",
    expected: [
      { type: "ipv4", needle: "192.168.0.1" },
      { type: "ipv4", needle: "10.255.255.254" },
    ],
  },
  {
    id: "sweep-002-email-quoted",
    source: "synthesized",
    input: 'Header: From: "Alice" <alice@example.com>',
    expected: [{ type: "email", needle: "alice@example.com" }],
  },
  {
    id: "sweep-003-uuid-in-url",
    source: "synthesized",
    input:
      "GET /api/jobs/12345678-1234-4234-9abc-123456789abc/status HTTP/1.1",
    expected: [
      { type: "uuid", needle: "12345678-1234-4234-9abc-123456789abc" },
    ],
  },
  {
    id: "sweep-004-mac-multi",
    source: "synthesized",
    input:
      "Bridge: aa:bb:cc:dd:ee:ff <-> 11:22:33:44:55:66 (passthrough)",
    expected: [
      { type: "mac address", needle: "aa:bb:cc:dd:ee:ff" },
      { type: "mac address", needle: "11:22:33:44:55:66" },
    ],
  },
  {
    id: "sweep-005-userpath-with-dot",
    source: "synthesized",
    input: "Logs at /home/jane.doe/var/syslog.1",
    expected: [{ type: "user path", needle: "jane.doe" }],
  },
  {
    id: "sweep-006-jwt-embedded",
    source: "synthesized",
    input:
      "{\"token\":\"eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4eHgifQ.aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890\"}",
    expected: [
      {
        type: "jwt",
        needle:
          "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4eHgifQ.aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890",
      },
    ],
  },
  {
    id: "sweep-007-ipv6-with-port",
    source: "synthesized",
    input: "[2001:db8::1]:8080 was the listener",
    expected: [{ type: "ipv6", needle: "2001:db8::1" }],
  },
  {
    id: "sweep-008-fqdn-cdn",
    source: "synthesized",
    input: "Asset hosted on cdn.fastly.net for static delivery.",
    expected: [{ type: "fqdn", needle: "cdn.fastly.net" }],
  },
  {
    id: "sweep-009-bearer-no-auth-prefix",
    source: "synthesized",
    input:
      "Saw token in body: Bearer xyzqrstuvwxyz1234567890abcdefgh that should not be there.",
    expected: [
      {
        type: "bearer token",
        needle: "xyzqrstuvwxyz1234567890abcdefgh",
      },
    ],
  },
  {
    id: "sweep-010-aws-multi-prefix",
    source: "synthesized",
    input:
      "Old ANPAJ1NLBQDX9YOA0001 replaced by AGPAJ1NLBQDX9YOA0002 for service.",
    expected: [
      { type: "aws access key", needle: "ANPAJ1NLBQDX9YOA0001" },
      { type: "aws access key", needle: "AGPAJ1NLBQDX9YOA0002" },
    ],
  },
  {
    id: "sweep-011-uuid-lowercase",
    source: "synthesized",
    input: "id=ffffffff-ffff-4fff-bfff-ffffffffffff in DB.",
    expected: [
      { type: "uuid", needle: "ffffffff-ffff-4fff-bfff-ffffffffffff" },
    ],
  },
  {
    id: "sweep-012-email-corner",
    source: "synthesized",
    input: "Notify ops-list@infra.engineering.dev about the spike.",
    expected: [{ type: "email", needle: "ops-list@infra.engineering.dev" }],
  },
  {
    id: "sweep-013-mac-uppercase",
    source: "synthesized",
    input: "Adapter ID: DE:AD:BE:EF:CA:FE active",
    expected: [{ type: "mac address", needle: "DE:AD:BE:EF:CA:FE" }],
  },
  {
    id: "sweep-014-fqdn-gov",
    source: "synthesized",
    input: "Phishing landed on portal.dept.gov briefly.",
    expected: [{ type: "fqdn", needle: "portal.dept.gov" }],
  },
  {
    id: "sweep-015-ipv4-end-of-line",
    source: "synthesized",
    input: "Last seen IP: 198.51.100.99",
    expected: [{ type: "ipv4", needle: "198.51.100.99" }],
  },
  {
    id: "sweep-016-jwt-headers-only",
    source: "synthesized",
    input:
      "Header: Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjF9.signaturepartabc1234567890",
    expected: [
      {
        type: "jwt",
        needle:
          "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjF9.signaturepartabc1234567890",
      },
    ],
  },
  {
    id: "sweep-017-userpath-multi",
    source: "synthesized",
    input:
      "/Users/alice/dev and /Users/alice/Downloads both used by alice.",
    expected: [
      { type: "user path", needle: "alice" },
      { type: "user path", needle: "alice", occurrence: 1 },
    ],
  },
  {
    id: "sweep-018-ipv6-double-zero",
    source: "synthesized",
    input: "Anycast 2001:4860:4860::8888 reachable",
    expected: [{ type: "ipv6", needle: "2001:4860:4860::8888" }],
  },
  {
    id: "sweep-019-multi-detector-dense",
    source: "synthesized",
    input:
      "POST https://api.example.com/v1 from 8.8.8.8 with Authorization: Bearer ghp_abcabcabcabcabcabcabcabcabcabcabcabc",
    expected: [
      { type: "fqdn", needle: "api.example.com" },
      { type: "ipv4", needle: "8.8.8.8" },
      {
        type: "github token",
        needle: "ghp_abcabcabcabcabcabcabcabcabcabcabcabc",
      },
    ],
  },
  {
    id: "sweep-020-negative-hex-soup",
    source: "synthesized",
    input:
      "Hash: a1b2c3d4e5f60718293a4b5c6d7e8f90 (md5 of payload). Not a token.",
    expected: [],
  },
  {
    id: "sweep-021-private-ec",
    source: "synthesized",
    input: `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxoAoGCCqGSM49
-----END EC PRIVATE KEY-----`,
    expected: [
      {
        type: "private key block",
        needle: `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxoAoGCCqGSM49
-----END EC PRIVATE KEY-----`,
      },
    ],
  },
  {
    id: "sweep-022-asia-prefix",
    source: "synthesized",
    input: "Federation issued ASIA1234567890123456",
    expected: [{ type: "aws access key", needle: "ASIA1234567890123456" }],
  },
  {
    id: "sweep-023-bare-domain-no-tld-match",
    source: "synthesized",
    input: "Search reports.local for file index.",
    expected: [],
  },
  {
    id: "sweep-024-ipv4-inside-arp",
    source: "synthesized",
    input:
      "internet  10.20.30.40         0   00:50:56:c0:00:08  ARPA   eth0",
    expected: [
      { type: "ipv4", needle: "10.20.30.40" },
      { type: "mac address", needle: "00:50:56:c0:00:08" },
    ],
  },
  {
    id: "sweep-025-uuid-in-json",
    source: "synthesized",
    input: '{"correlationId":"00000000-0000-4000-8000-000000000001"}',
    expected: [
      { type: "uuid", needle: "00000000-0000-4000-8000-000000000001" },
    ],
  },
  {
    id: "sweep-026-ipv6-mixed-line",
    source: "synthesized",
    input: "wg0 peer 2001:db8::cafe sent 10.42.0.7 via tunnel",
    expected: [
      { type: "ipv6", needle: "2001:db8::cafe" },
      { type: "ipv4", needle: "10.42.0.7" },
    ],
  },
  {
    id: "sweep-027-jwt-unsigned",
    source: "synthesized",
    input:
      "Test header: eyJhbGciOiJub25lIn0.eyJzdWIiOiJndWVzdCJ9. for debugging",
    expected: [
      { type: "jwt", needle: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJndWVzdCJ9." },
    ],
  },
  {
    id: "sweep-028-bearer-jwt-priority",
    source: "synthesized",
    input:
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    expected: [
      // JWT runs first and claims the value. Bearer detection would have
      // grabbed the same range, so it's dropped by the overlap pass.
      {
        type: "jwt",
        needle:
          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
  },
  {
    id: "sweep-029-userpath-edge-windows",
    source: "synthesized",
    input: "Drive D:\\Users\\eve\\Documents has the artefact",
    expected: [{ type: "user path", needle: "eve" }],
  },
  {
    id: "sweep-030-fqdn-app",
    source: "synthesized",
    input: "Hosted at notion-clone.app for collab.",
    expected: [{ type: "fqdn", needle: "notion-clone.app" }],
  },
];

function main(): void {
  const dir = join(__dirname, "cases");
  mkdirSync(dir, { recursive: true });

  // Wipe existing JSONs so re-runs are deterministic.
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".json")) unlinkSync(join(dir, f));
  }

  for (const spec of CASES) {
    const compiled = compileCase(spec);
    writeFileSync(
      join(dir, `${spec.id}.json`),
      JSON.stringify(compiled, null, 2) + "\n",
      "utf-8",
    );
  }
  // eslint-disable-next-line no-console
  console.log(`Wrote ${CASES.length} corpus cases to ${dir}`);
}

main();
