#!/usr/bin/env node
/**
 * Tiny static server for the offline scaffold fixture (home.html).
 * Flatpak Chromium cannot open file:// under /tmp — HTTP localhost works.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../src/map/(app_base)");
// Each fixture HTML file lives beside its own page.block.ts under the
// Waygraph Map convention now (home/home.html, docs/docs.html) - no longer
// a single flat directory, so this maps the request filename to its own
// page's subfolder instead of assuming one shared ROOT holds every file.
const FILE_DIRS = {
  "home.html": "home",
  "docs.html": "docs",
};
const PORT = Number(process.env.WAYGRAPH_FIXTURE_PORT || 4177);
const HOST = process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer((req, res) => {
  const raw = (req.url || "/").split("?")[0] || "/";
  const rel = raw === "/" ? "home.html" : raw.replace(/^\//, "");
  const subdir = FILE_DIRS[rel];
  const full = subdir ? normalize(join(ROOT, subdir, rel)) : normalize(join(ROOT, rel));
  if (!full.startsWith(ROOT) || !existsSync(full)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const type = TYPES[extname(full)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(full));
});

server.listen(PORT, HOST, () => {
  if (process.env.WAYGRAPH_FIXTURE_QUIET !== "1") {
    console.error(`waygraph fixture: http://${HOST}:${PORT}/home.html`);
  }
});
