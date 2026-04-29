import type { MimirModule } from "@/registry/types";
import { CtiComponent } from "@/modules/cti/component";

const ctiModule: MimirModule = {
  id: "cti",
  category: "cti",
  label: "CTI Lookups",
  component: CtiComponent,
};

export default ctiModule;
