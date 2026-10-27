#!/usr/bin/env node
// Builds the overlay's one stylesheet: src/demo/overlay/ui/css/overlay.css through Tailwind (utilities used anywhere in
// the overlay's builders, the theme, the component files) into dist/demo/overlay/ui/overlay.css, plus host.css (rules for
// the page itself, outside the shadow root) copied next to it. See src/demo/overlay/ui/css/README.md.
//
// Also imported by .storybook/main.ts, so Storybook shows exactly the CSS a demo injects.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssDir = join(root, "src", "demo", "overlay", "ui", "css");

/**
 * Tailwind's output, made to work inside a shadow root: Chromium ignores `@property` there, so the defaults Tailwind
 * registers with it (`--tw-shadow: 0 0 #0000`, ...) never apply and every utility built from them (shadow, ring,
 * transform) computes to nothing. Tailwind already writes the same defaults as a fallback for browsers without
 * `@property`, behind an `@supports` test: this drops the `@property` rules and makes the fallback unconditional.
 */
export function forShadowRoot(css) {
  const out = css.replace(/@property\s+--[\w-]+\s*\{[^}]*\}\s*/g, "");
  const start = out.indexOf("@layer properties {");
  if (start < 0) return out;
  const supports = out.indexOf("@supports", start);
  const open = out.indexOf("{", supports);
  // The @supports block's own closing brace: walk to the brace that balances its opening one.
  let depth = 0;
  let close = open;
  for (; close < out.length; close++) {
    if (out[close] === "{") depth++;
    else if (out[close] === "}" && --depth === 0) break;
  }
  return out.slice(0, supports) + out.slice(open + 1, close) + out.slice(close + 1);
}

/** The compiled overlay stylesheet, as a string. */
export function buildOverlayCss({ minify = true } = {}) {
  const cli = join(dirname(createRequire(import.meta.url).resolve("@tailwindcss/cli/package.json")), "dist", "index.mjs");
  const args = [cli, "-i", join(cssDir, "overlay.css"), ...(minify ? ["--minify"] : [])];
  const css = execFileSync(process.execPath, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return "/* Built by scripts/build-ui-css.mjs from src/demo/overlay/ui/css/ - do not hand-edit. */\n" + forShadowRoot(css);
}

/** The page's own rules (the device stage around a phone-sized page), injected outside the shadow root. */
export function readHostCss() {
  return readFileSync(join(cssDir, "host.css"), "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = join(root, "dist", "demo", "overlay", "ui");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "overlay.css"), buildOverlayCss());
  writeFileSync(join(outDir, "host.css"), readHostCss());
}
