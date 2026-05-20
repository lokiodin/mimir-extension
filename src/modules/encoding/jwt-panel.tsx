import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  jwtDecodeParts,
  jwtEncodeParts,
  jwtHmacResign,
  jwtVerify,
  type JwtParts,
  type JwtVerdict,
} from "@/modules/encoding/operations";
import { CopyIconButton } from "@/components/CopyIconButton";

const TA_CLASS =
  "flex-1 min-h-[5rem] resize-none bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 pr-8 font-mono text-sm focus:outline-none focus:border-gray-500";
const ERR_CLASS =
  "text-red-400 bg-red-950/30 border border-red-900/50 px-2 py-1 rounded text-sm font-mono";

interface JwtPanelProps {
  input: string;
  onInputChange: (value: string) => void;
}

function hsVariantFor(alg: string): "HS256" | "HS384" | "HS512" {
  if (alg.endsWith("384")) return "HS384";
  if (alg.endsWith("512")) return "HS512";
  return "HS256";
}

export const JwtPanel: React.FC<JwtPanelProps> = ({
  input,
  onInputChange,
}) => {
  const baseId = useId();
  const headerId = `${baseId}-header`;
  const payloadId = `${baseId}-payload`;
  const sigId = `${baseId}-signature`;
  const secretId = `${baseId}-secret`;
  const verifyKeyId = `${baseId}-verify-key`;
  const [parts, setParts] = useState<JwtParts>({
    header: "",
    payload: "",
    signature: "",
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [verifyKey, setVerifyKey] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [verdict, setVerdict] = useState<JwtVerdict | null>(null);
  const lastDecoded = useRef<string>("");

  // Decode incoming token text into editable parts (once per distinct input).
  useEffect(() => {
    if (input === "" || input === lastDecoded.current) return;
    try {
      setParts(jwtDecodeParts(input));
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
    lastDecoded.current = input;
  }, [input]);

  const headerAlg = useMemo(() => {
    try {
      const h = JSON.parse(parts.header) as Record<string, unknown>;
      return typeof h.alg === "string" ? h.alg : "";
    } catch {
      return "";
    }
  }, [parts.header]);

  // Live token output, with the §4.2 signature precedence.
  const [token, setToken] = useState<string>("");
  const [encodeError, setEncodeError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        if (secret !== "") {
          const t = await jwtHmacResign(
            parts.header,
            parts.payload,
            secret,
            hsVariantFor(headerAlg),
          );
          if (!cancelled) {
            setToken(t);
            setEncodeError(null);
          }
          return;
        }
        const t = jwtEncodeParts(parts);
        if (!cancelled) {
          setToken(t);
          setEncodeError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setToken("");
          setEncodeError(e instanceof Error ? e.message : String(e));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [parts, secret, headerAlg]);

  const onVerify = async (): Promise<void> => {
    setVerdict(await jwtVerify(token || input, verifyKey));
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto">
      {parseError !== null && (
        <div aria-live="polite" className={ERR_CLASS}>
          {parseError}
        </div>
      )}

      <Field label="Header (JSON)" htmlFor={headerId}>
        <textarea
          id={headerId}
          value={parts.header}
          onChange={(e) => setParts({ ...parts, header: e.target.value })}
          spellCheck={false}
          className={TA_CLASS}
        />
      </Field>

      <Field label="Payload (JSON)" htmlFor={payloadId}>
        <textarea
          id={payloadId}
          value={parts.payload}
          onChange={(e) => setParts({ ...parts, payload: e.target.value })}
          spellCheck={false}
          className={TA_CLASS}
        />
      </Field>

      <Field
        htmlFor={sigId}
        label={
          secret !== ""
            ? "Signature (computed — clear secret to edit)"
            : "Signature (base64url — clear for alg:none attack)"
        }
      >
        <textarea
          id={sigId}
          value={parts.signature}
          onChange={(e) =>
            setParts({ ...parts, signature: e.target.value })
          }
          readOnly={secret !== ""}
          spellCheck={false}
          className={`${TA_CLASS}${secret !== "" ? " cursor-not-allowed opacity-60" : ""}`}
        />
      </Field>

      <Field label="Re-sign HMAC secret (optional — empty keeps signature as-is)" htmlFor={secretId}>
        <input
          id={secretId}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          spellCheck={false}
          className="bg-gray-800 text-gray-100 border border-gray-700 rounded px-2 py-1 font-mono text-sm"
        />
      </Field>
      {secret !== "" && !headerAlg.startsWith("HS") && (
        <div className={ERR_CLASS}>
          Possible algorithm-confusion: HMAC-signing a {headerAlg || "?"} token
          with the supplied secret (RS&rarr;HS attack). Output uses{" "}
          {hsVariantFor(headerAlg)}.
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-400">Token output</span>
        <div className="relative flex">
          <textarea
            value={token}
            readOnly
            spellCheck={false}
            className={`${TA_CLASS} min-h-[4rem]`}
          />
          {token !== "" && (
            <CopyIconButton text={token} label="Copy token" />
          )}
        </div>
        {encodeError !== null && (
          <div aria-live="polite" className={ERR_CLASS}>
            {encodeError}
          </div>
        )}
      </div>

      <Field label="Verification key (secret / PEM / JWK / JWKS)" htmlFor={verifyKeyId}>
        <textarea
          id={verifyKeyId}
          value={verifyKey}
          onChange={(e) => setVerifyKey(e.target.value)}
          spellCheck={false}
          className={TA_CLASS}
        />
      </Field>
      <button
        onClick={() => void onVerify()}
        className="self-start text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700"
      >
        Verify signature
      </button>

      {verdict !== null && (
        <div className="flex flex-col gap-1 border border-gray-700 rounded p-2 text-sm">
          <div className="font-mono">
            signature: <strong>{verdict.signature}</strong> · alg:{" "}
            {verdict.alg || "(none)"}
          </div>
          {verdict.temporal.expired && (
            <div className="text-amber-400">token expired (exp)</div>
          )}
          {verdict.temporal.notYetValid && (
            <div className="text-amber-400">not yet valid (nbf)</div>
          )}
          {verdict.temporal.iatFuture && (
            <div className="text-amber-400">issued in the future (iat)</div>
          )}
          {verdict.warnings.map((w) => (
            <div key={w} className="text-amber-400">
              {w}
            </div>
          ))}
          {verdict.detail && (
            <div className="text-gray-400 font-mono">{verdict.detail}</div>
          )}
        </div>
      )}

      <button
        onClick={() => onInputChange(token || input)}
        className="self-start text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700"
        title="Push the current token back to the module input"
      >
        Load token into input
      </button>
    </div>
  );
};

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode }> = ({
  label,
  htmlFor,
  children,
}) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={htmlFor} className="text-xs text-gray-400">
      {label}
    </label>
    <div className="relative flex">{children}</div>
  </div>
);
