import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/**
 * The whole overlay stylesheet (Open Props subset + ring/cursor/banner/dock/panel), bundled by
 * `scripts/copy-ui-css.mjs` into `dist/ui/overlay.css`. One real CSS file, read once, injected by
 * `ui/shadow.ts` into the overlay's shadow root - every surface (demo/auto/browser/pilot) gets the
 * exact same rules, not a per-surface regenerated copy.
 */
export function getOverlaySheet(): string {
  if (cached !== undefined) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  // Compiled to dist/ui/stylesheet.js; the bundle sits right next to it.
  cached = readFileSync(join(here, "overlay.css"), "utf8");
  return cached;
}
