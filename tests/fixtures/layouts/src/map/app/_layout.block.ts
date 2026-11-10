// Covers every page under app/: App, Plant and Equipment.
import { defineLayout } from "../../../../../../dist/index.js";
import { App } from "../../pages.js";

export const Shell = defineLayout({
  name: "shell",
  go: {
    up: { to: "parent", click: "#up" },
    home: { to: App, click: "#home" },
  },
});
