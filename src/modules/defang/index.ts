import type { MimirModule } from "@/registry/types";
import { DefangComponent } from "@/modules/defang/component";
import { defaultContextMenuInvoke } from "@/registry/context-menu-default-invoke";

const defangModule: MimirModule = {
  id: "defang",
  category: "utilities",
  label: "Defang",
  component: DefangComponent,
  contextMenu: {
    title: "Defang URL with Mimir",
    onInvoke: defaultContextMenuInvoke("defang"),
  },
};

export default defangModule;
