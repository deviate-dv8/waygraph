import { defineNavBlock } from "../../../../../../dist/index.js";
import { App } from "../../pages.js";

export const NavApp = defineNavBlock({ name: "nav-app", checkpoint: App, url: "https://app.test/app" });
