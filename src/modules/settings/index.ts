import type { MimirModule } from "@/registry/types";
import { SettingsComponent } from "@/modules/settings/component";

const settingsModule: MimirModule = {
  id: "settings",
  category: "settings",
  label: "Settings",
  component: SettingsComponent,
};

export default settingsModule;
