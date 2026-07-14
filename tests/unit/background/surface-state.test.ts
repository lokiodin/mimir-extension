import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ExtensionContext {
  contextType: string;
  documentUrl?: string;
}

function installChrome(opts: {
  contexts?: ExtensionContext[];
  contextsThrows?: boolean;
  contextsUndefined?: boolean;
  ownOrigin?: string;
}): { getContextsCalls: Array<{ contextTypes?: string[] }> } {
  const calls: Array<{ contextTypes?: string[] }> = [];
  const ownOrigin = opts.ownOrigin ?? "chrome-extension://abc123/";
  const runtime: Record<string, unknown> = {
    getURL: (path: string) => `${ownOrigin}${path}`,
  };
  if (!opts.contextsUndefined) {
    runtime.getContexts = vi.fn(async (filter: { contextTypes?: string[] }) => {
      calls.push(filter);
      if (opts.contextsThrows) throw new Error("getContexts failed");
      return opts.contexts ?? [];
    });
  }
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime };
  return { getContextsCalls: calls };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isAnyMimirSurfaceOpen", () => {
  it("returns false when getContexts returns no Mimir contexts", async () => {
    installChrome({ contexts: [] });
    const { isAnyMimirSurfaceOpen } = await import(
      "../../../src/background/surface-state"
    );
    expect(await isAnyMimirSurfaceOpen()).toBe(false);
  });

  it("returns true when a POPUP context is present", async () => {
    installChrome({
      contexts: [
        {
          contextType: "POPUP",
          documentUrl: "chrome-extension://abc123/popup.html",
        },
      ],
    });
    const { isAnyMimirSurfaceOpen } = await import(
      "../../../src/background/surface-state"
    );
    expect(await isAnyMimirSurfaceOpen()).toBe(true);
  });

  it("returns true when a TAB context on window.html is present", async () => {
    installChrome({
      contexts: [
        {
          contextType: "TAB",
          documentUrl: "chrome-extension://abc123/window.html",
        },
      ],
    });
    const { isAnyMimirSurfaceOpen } = await import(
      "../../../src/background/surface-state"
    );
    expect(await isAnyMimirSurfaceOpen()).toBe(true);
  });

  it("ignores TAB contexts that are not the standalone window", async () => {
    installChrome({
      contexts: [
        {
          contextType: "TAB",
          documentUrl: "chrome-extension://abc123/options.html",
        },
        {
          contextType: "TAB",
          documentUrl: "https://example.com/page",
        },
      ],
    });
    const { isAnyMimirSurfaceOpen } = await import(
      "../../../src/background/surface-state"
    );
    expect(await isAnyMimirSurfaceOpen()).toBe(false);
  });

  it("returns true conservatively when getContexts is undefined", async () => {
    installChrome({ contextsUndefined: true });
    const { isAnyMimirSurfaceOpen } = await import(
      "../../../src/background/surface-state"
    );
    expect(await isAnyMimirSurfaceOpen()).toBe(true);
  });

  it("returns true conservatively when getContexts throws", async () => {
    installChrome({ contextsThrows: true });
    const { isAnyMimirSurfaceOpen } = await import(
      "../../../src/background/surface-state"
    );
    expect(await isAnyMimirSurfaceOpen()).toBe(true);
  });

  it("filters by POPUP and TAB context types", async () => {
    const { getContextsCalls } = installChrome({ contexts: [] });
    const { isAnyMimirSurfaceOpen } = await import(
      "../../../src/background/surface-state"
    );
    await isAnyMimirSurfaceOpen();
    expect(getContextsCalls).toHaveLength(1);
    expect(getContextsCalls[0].contextTypes).toEqual(["POPUP", "TAB"]);
  });
});
