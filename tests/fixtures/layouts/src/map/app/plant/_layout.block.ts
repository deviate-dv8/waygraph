// Nested: covers Plant and Equipment, which Shell covers too.
import { defineLayout } from "../../../../../../../dist/index.js";
import { Equipment } from "../../../pages.js";

export const PlantTabs = defineLayout({
  name: "plant-tabs",
  go: { equipment: { to: Equipment, click: "#equipment" } },
});
