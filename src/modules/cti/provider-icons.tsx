import React from "react";
import type { CtiProvider } from "@/background/cti-types";

// Per-provider chips for the history pane. Letter chips with brand-ish colors,
// per the brief's allowance to fall back to single-letter chips when the
// official SVG logo isn't easily obtainable. No external URLs, ships offline.

interface ChipSpec {
  letter: string;
  bg: string;
  fg: string;
  title: string;
}

const SPECS: Record<CtiProvider, ChipSpec> = {
  virustotal: {
    letter: "V",
    bg: "bg-blue-700",
    fg: "text-blue-50",
    title: "VirusTotal",
  },
  abuseipdb: {
    letter: "A",
    bg: "bg-red-700",
    fg: "text-red-50",
    title: "AbuseIPDB",
  },
  abusech: {
    letter: "H",
    bg: "bg-emerald-700",
    fg: "text-emerald-50",
    title: "abuse.ch",
  },
};

interface ProviderIconProps {
  provider: CtiProvider;
  dim?: boolean;
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  provider,
  dim = false,
}) => {
  const spec = SPECS[provider];
  const opacity = dim ? "opacity-40" : "";
  return (
    <span
      title={spec.title}
      aria-label={spec.title}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-sm text-[10px] font-bold ${spec.bg} ${spec.fg} ${opacity}`}
    >
      {spec.letter}
    </span>
  );
};
