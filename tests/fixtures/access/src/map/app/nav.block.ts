import { defineNavBlock, Trait } from "waygraph";
import { App } from "../../app.js";

export const NavApp = defineNavBlock({ name: "nav-app", checkpoint: App, url: "https://app.test/app", verify: [Trait.visible("#app-title")] });
