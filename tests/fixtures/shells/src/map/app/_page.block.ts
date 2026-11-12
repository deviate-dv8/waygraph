import { definePageBlock } from "../../../../../../dist/index.js";

// The app's shell: a page of its own that covers every page below it.
export const App = definePageBlock({
  name: "page-shell-app",
  checkpoint: "ShellApp",
  url: "https://app.test/app",
  covers: "children",
  links: (self) => ({
    docs: self.link({ to: "ShellDocs", click: "#docs" }),
    settings: self.link({ to: "ShellSettings", click: "#settings" }),
  }),
  interrupts: { banner: { when: "#banner", do: async (page) => void (await page.locator("#banner button").click()) } },
});
