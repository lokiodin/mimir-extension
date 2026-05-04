import type { PopupContextMenuEntry } from "@/registry/context-menu-types";

const entry: PopupContextMenuEntry = {
  moduleId: "defang",
  title: "Defang URL with Mimir",
  contexts: ["selection"],
  invocation: { kind: "popup" },
};

export default entry;
