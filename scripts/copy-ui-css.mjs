#!/usr/bin/env node
// The overlay stylesheet is real .css (src/ui/css/*.css), not JS-generated strings - see
// src/ui/css/README.md. Bundle it + the Open Props (github.com/argyleink/open-props) shadow-DOM
// variant it's built on into dist/ui/overlay.css, one file, loaded once at runtime.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const opDir = join(root, "node_modules", "open-props");
// Curated subset: structural primitives we actually reference (z-index/easing/shadow scales).
// Not colors/fonts/animations/aspects - our tones are our own brand, not Open Props' palette.
const OPEN_PROPS_FILES = ["zindex.shadow.min.css", "easings.shadow.min.css", "shadows.shadow.min.css"];
const cssDir = join(root, "src", "ui", "css");
const ORDER = ["tokens.css", "ring.css", "cursor.css", "banner.css", "dock.css", "panel.css"];

const parts = [
  "/* Bundled at build time by scripts/copy-ui-css.mjs - do not hand-edit. Edit src/ui/css/*.css. */",
  ...OPEN_PROPS_FILES.map((f) => readFileSync(join(opDir, f), "utf8")),
  ...ORDER.map((f) => readFileSync(join(cssDir, f), "utf8")),
];
const missing = readdirSync(cssDir).filter((f) => f.endsWith(".css") && !ORDER.includes(f) && f !== "README.md");
if (missing.length) throw new Error(`copy-ui-css: new file(s) in src/ui/css/ not in ORDER: ${missing.join(", ")}`);

const outDir = join(root, "dist", "ui");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "overlay.css"), parts.join("\n\n"));
