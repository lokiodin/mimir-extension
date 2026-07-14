import type { MimirModule } from "@/registry/types";
import { EncodingComponent } from "@/modules/encoding/component";
import { defaultContextMenuInvoke } from "@/registry/context-menu-default-invoke";

const encodingModule: MimirModule = {
  id: "encoding",
  category: "encoding",
  label: "Encoding",
  component: EncodingComponent,
  contextMenu: {
    title: "Decode with Mimir",
    onInvoke: defaultContextMenuInvoke("encoding"),
  },
};

export default encodingModule;
