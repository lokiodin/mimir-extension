// Shared popup-mode onInvoke for modules that just route + prefill.
// The dispatcher in the popup actually owns the routing/prefill writes; this
// helper is kept as the popup-side `onInvoke` for forward compatibility with
// the MimirModule interface (a future module may want custom popup-mode
// routing logic). For Encoding/Defang/CTI today, all four behaviours collapse
// to the same two-line action.

import { useMimirStore } from "@/store";

export const defaultContextMenuInvoke =
  (moduleId: string) =>
  (selection: string): void => {
    const store = useMimirStore.getState();
    store.setActiveModuleId(moduleId);
    store.setPendingInput({ moduleId, value: selection });
  };
