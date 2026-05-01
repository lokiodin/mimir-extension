import type { MimirModule } from "@/registry/types";
import { RedactionComponent } from "./component";

const redaction: MimirModule = {
  id: "redaction",
  category: "utilities",
  label: "Redaction",
  component: RedactionComponent,
};

export default redaction;
