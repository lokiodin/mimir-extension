import type { DetectorMeta } from "../types";
import { privateKey } from "./private-key";
import { awsKey } from "./aws-key";
import { githubToken } from "./github-token";
import { jwt } from "./jwt";
import { email } from "./email";
import { ipv4 } from "./ipv4";
import { ipv6 } from "./ipv6";
import { mac } from "./mac";
import { bearerToken } from "./bearer-token";
import { userPath } from "./user-path";
import { fqdn } from "./fqdn";
import { uuidEntropy } from "./uuid-entropy";

// Order matters: highest priority first. Stage 1 walks this list in order
// and drops later detections that overlap an earlier one. The settings
// "Redaction Detectors" section reads `DETECTOR_LABELS` from this same
// list so it stays in sync with the registry.
export const DETECTORS: ReadonlyArray<DetectorMeta> = [
  privateKey,
  awsKey,
  githubToken,
  jwt,
  email,
  ipv4,
  ipv6,
  mac,
  bearerToken,
  userPath,
  fqdn,
  uuidEntropy,
];

export const DETECTOR_LABELS: ReadonlyArray<{ id: string; label: string }> =
  DETECTORS.map((d) => ({ id: d.id, label: d.label }));

export function getDetector(id: string): DetectorMeta | undefined {
  return DETECTORS.find((d) => d.id === id);
}
