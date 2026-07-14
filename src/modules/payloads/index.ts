import type { MimirModule } from "@/registry/types";
import { PayloadsComponent } from "@/modules/payloads/component";

const payloadsModule: MimirModule = {
  id: "payloads",
  category: "payloads",
  label: "Payload Library",
  component: PayloadsComponent,
};

export default payloadsModule;
