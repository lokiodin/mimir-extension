import React from "react";
import type { MimirModule } from "@/registry/types";

const PlaceholderComponent: React.FC = () => {
  return React.createElement(
    "div",
    { className: "p-4 text-center text-gray-300" },
    React.createElement("p", null, "Hello from placeholder"),
  );
};

const placeholderModule: MimirModule = {
  id: "placeholder",
  category: "utilities",
  label: "Placeholder",
  component: PlaceholderComponent,
};

export default placeholderModule;
