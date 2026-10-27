import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sheets = new Map<string, string>();

/** A built stylesheet next to this file in dist (scripts/build-ui-css.mjs), read once. */
function sheet(name: "overlay.css" | "host.css"): string {
  let css = sheets.get(name);
  if (css === undefined) {
    css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), name), "utf8");
    sheets.set(name, css);
  }
  return css;
}

/** The overlay's one stylesheet (ui/css/overlay.css through Tailwind), injected into its shadow root. */
export function getOverlaySheet(): string {
  return sheet("overlay.css");
}

/** Rules for the page itself (the device stage), injected into the page outside the shadow root. */
export function getHostSheet(): string {
  return sheet("host.css");
}
