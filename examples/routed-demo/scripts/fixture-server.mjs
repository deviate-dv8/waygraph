// Stands in for this example's real app: serves src/pages/<name>.html at clean URLs (/dashboard, /docs).
// Started and stopped by config/waygraph.config.ts's webServer - waygraph run/demo/auto/test all honor it.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PAGES = join(import.meta.dirname, "../src/pages");

createServer((req, res) => {
  const path = (req.url || "/").split("?")[0];
  const name = path === "/" ? "dashboard" : path.slice(1);
  const file = join(PAGES, `${name}.html`);
  if (!/^[a-z-]+$/.test(name) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(file));
}).listen(4277, "127.0.0.1");
