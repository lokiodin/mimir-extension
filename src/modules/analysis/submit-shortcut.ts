// Cmd+Enter (macOS) / Ctrl+Enter (elsewhere) submits the log for analysis.
// Both modifiers are accepted on every platform; only the hint differs.

interface NavigatorLike {
  userAgentData?: { platform?: string };
  platform?: string;
}

// Defaults to macOS when the platform cannot be determined.
export function isMacPlatform(nav: NavigatorLike | undefined): boolean {
  const platform = nav?.userAgentData?.platform || nav?.platform || "";
  if (platform === "") return true;
  return /mac|iphone|ipad/i.test(platform);
}

export function submitShortcutLabel(isMac: boolean): string {
  return isMac ? "⌘↵" : "Ctrl+↵";
}

export function isSubmitShortcut(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return e.key === "Enter" && (e.metaKey || e.ctrlKey);
}
