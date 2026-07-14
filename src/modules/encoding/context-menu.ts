import type { PopupContextMenuEntry } from "@/registry/context-menu-types";

const entry: PopupContextMenuEntry = {
  moduleId: "encoding",
  title: "Decode with Mimir",
  contexts: ["selection"],
  invocation: { kind: "popup" },
};

export default entry;
