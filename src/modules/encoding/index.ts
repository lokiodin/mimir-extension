import type { MimirModule } from "@/registry/types";
import { EncodingComponent } from "@/modules/encoding/component";

const encodingModule: MimirModule = {
  id: "encoding",
  category: "encoding",
  label: "Encoding",
  component: EncodingComponent,
};

export default encodingModule;
