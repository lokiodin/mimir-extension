// Detect whether any Mimir UI surface (popup or standalone window) is
// currently rendered. SW-only. Used by the Log Analysis background runner to
// decide whether to auto-open the popup on completion.
//
// Uses chrome.runtime.getContexts (Chromium 116+, Firefox 119+). Feature-
// detected: when getContexts is unavailable we treat the surface state as
// unknown and return true so the auto-open path is skipped — the badge +
// history fallback still works correctly.

interface ExtensionContext {
  contextType: string;
  documentUrl?: string;
}

interface RuntimeWithGetContexts {
  getContexts?: (filter: {
    contextTypes?: string[];
  }) => Promise<ExtensionContext[]>;
}

export async function isAnyMimirSurfaceOpen(): Promise<boolean> {
  const api = chrome.runtime as unknown as RuntimeWithGetContexts;
  if (!api.getContexts) return true;
  try {
    const contexts = await api.getContexts({
      contextTypes: ["POPUP", "TAB"],
    });
    const ownOrigin = chrome.runtime.getURL("");
    return contexts.some((ctx) => {
      if (ctx.contextType === "POPUP") return true;
      if (ctx.contextType !== "TAB") return false;
      if (typeof ctx.documentUrl !== "string") return false;
      return (
        ctx.documentUrl.startsWith(ownOrigin) &&
        ctx.documentUrl.includes("window.html")
      );
    });
  } catch {
    return true;
  }
}
