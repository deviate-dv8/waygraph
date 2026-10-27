// Storybook for the overlay: every story runs the real in-page builders (src/demo/overlay/inpage/, the stepper's
// panels) against a stand-in for Playwright's page (stories/page.ts), with the stylesheet a demo injects.
import type { StorybookConfig } from "@storybook/html-vite";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const STYLESHEET = fileURLToPath(new URL("../src/demo/overlay/ui/stylesheet.ts", import.meta.url));
const PLAYWRIGHT_STUB = fileURLToPath(new URL("./playwright-stub.ts", import.meta.url));

/** `ui/stylesheet.ts` reads the built CSS from disk; in Storybook it is built on the fly, and again on every change. */
function overlayStylesheet(): Plugin {
  return {
    name: "waygraph-overlay-stylesheet",
    enforce: "pre",
    resolveId(id, importer) {
      if (id.endsWith("/stylesheet.js") && importer?.includes("/src/demo/overlay/")) return STYLESHEET;
      return null;
    },
    async load(id) {
      if (id !== STYLESHEET) return null;
      const { buildOverlayCss, readHostCss } = await import("../scripts/build-ui-css.mjs");
      const css = buildOverlayCss({ minify: false });
      return `export const getOverlaySheet = () => ${JSON.stringify(css)};\nexport const getHostSheet = () => ${JSON.stringify(readHostCss())};\n`;
    },
    handleHotUpdate({ file, server }) {
      if (!/\/src\/(demo|live)\//.test(file)) return;
      const mod = server.moduleGraph.getModuleById(STYLESHEET);
      if (mod) server.moduleGraph.invalidateModule(mod);
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

const config: StorybookConfig = {
  framework: { name: "@storybook/html-vite", options: {} },
  stories: ["../stories/*.stories.ts"],
  core: { disableTelemetry: true },
  viteFinal(vite) {
    vite.plugins = [...(vite.plugins ?? []), overlayStylesheet()];
    // The overlay reads WAYGRAPH_* settings through engine/env.ts; a story has none.
    vite.define = { ...vite.define, "process.env": "{}" };
    vite.resolve = { ...vite.resolve, alias: { ...(vite.resolve?.alias as Record<string, string> | undefined), "@playwright/test": PLAYWRIGHT_STUB } };
    return vite;
  },
};
export default config;
