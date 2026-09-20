#!/usr/bin/env node
/**
 * Tiny static server for this example's offline fixture pages.
 * Mirrors templates/scaffold's own scripts/fixture-server.mjs exactly.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../src/pages");
const PORT = Number(process.env.WAYGRAPH_FIXTURE_PORT || 4277);
const HOST = process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
};

const server = createServer((req, res) => {
  const raw = (req.url || "/").split("?")[0] || "/";
  const rel = raw === "/" ? "dashboard.html" : raw.replace(/^\//, "");
  const full = normalize(join(ROOT, rel));
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
    console.error(`waygraph fixture: http://${HOST}:${PORT}/dashboard.html`);
  }
});
