// At the root, but `on` says which pages: only Login.
import { defineLayout } from "../../../../../dist/index.js";
import { App, Login } from "../pages.js";

export const Banner = defineLayout({
  name: "banner",
  on: [Login],
  go: { app: { to: App, click: "#to-app" } },
});
