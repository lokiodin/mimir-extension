import type { PopupContextMenuEntry } from "@/registry/context-menu-types";

const entry: PopupContextMenuEntry = {
  moduleId: "cti",
  title: "Lookup IOC with Mimir",
  contexts: ["selection"],
  invocation: { kind: "popup" },
};

export default entry;
