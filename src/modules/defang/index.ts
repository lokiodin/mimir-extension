import type { MimirModule } from "@/registry/types";
import { DefangComponent } from "@/modules/defang/component";

const defangModule: MimirModule = {
  id: "defang",
  category: "utilities",
  label: "Defang",
  component: DefangComponent,
};

export default defangModule;
