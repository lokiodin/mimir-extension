import React, { useEffect, useState } from "react";

// Shared in-corner copy icon. Mirrors the original Log Analysis affordance:
// outline clipboard glyph idle, checkmark for ~1.5s after click, no toast.
// Default classes position the button absolute top-right, so the parent must
// be positioned (typically `relative`) and reserve right-side padding so its
// content doesn't run under the icon.

const DEFAULT_CLASSES =
  "absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800";

const FEEDBACK_MS = 1500;

export interface CopyIconButtonProps {
  text: string | (() => string);
  label?: string;
  className?: string;
}

export const CopyIconButton: React.FC<CopyIconButtonProps> = ({
  text,
  label = "Copy",
  className,
}) => {
  const [copied, setCopied] = useState(false);

  // Drop a stale "copied" flag when the underlying value changes (e.g. user
  // switches to a different log-analysis history entry while the checkmark is
  // still showing). For function-form `text`, identity-change of the function
  // ref triggers the same reset.
  useEffect(() => {
    setCopied(false);
  }, [text]);

  const handleClick = async (): Promise<void> => {
    const value = typeof text === "function" ? text() : text;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), FEEDBACK_MS);
    } catch {
      // Clipboard write can fail when the surface lacks focus; the user can
      // re-trigger or select the text manually.
    }
  };

  const tooltip = copied ? "Copied" : label;
  const classes =
    className === undefined ? DEFAULT_CLASSES : `${DEFAULT_CLASSES} ${className}`;

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      title={tooltip}
      aria-label={label}
      className={classes}
    >
      {copied ? (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
};
