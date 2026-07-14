import type { MimirModule } from "@/registry/types";
import { CtiComponent } from "@/modules/cti/component";
import { defaultContextMenuInvoke } from "@/registry/context-menu-default-invoke";

const ctiModule: MimirModule = {
  id: "cti",
  category: "cti",
  label: "CTI Lookups",
  component: CtiComponent,
  contextMenu: {
    title: "Lookup IOC with Mimir",
    onInvoke: defaultContextMenuInvoke("cti"),
  },
};

export default ctiModule;
