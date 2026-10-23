import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine, MemPage, checkpoint, defineNavBlock } from "../../src/index.js";
import type { Checkpoint } from "../../src/index.js";
import { buildFlow } from "../../src/engine/flow/flow.js";

type Home = Checkpoint<"Home">;

test("an Engine built from one config follows the config the run selected with --config", async () => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.headers.host ?? "");
    res.end("<html><body>hi</body></html>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const project = mkdtempSync(join(tmpdir(), "wg-sel-"));
  mkdirSync(join(project, "config"));
  writeFileSync(join(project, "config", "waygraph.staging.config.mjs"), `export default { baseUrl: "http://127.0.0.1:${port}" };\n`);
  const cwd = process.cwd();
  process.chdir(project);
  process.env.WAYGRAPH_CONFIG = "staging";
  try {
    const NavHome = defineNavBlock<Home>({ name: "nav-home", checkpoint: "Home", url: "/" });
    // built from a config with no baseUrl at all
    const flow = buildFlow([NavHome], new Engine({}).config);
    expect(await flow.run(new MemPage())).toEqual(checkpoint("Home"));
    expect(hits.length).toBeGreaterThan(0);
  } finally {
    delete process.env.WAYGRAPH_CONFIG;
    process.chdir(cwd);
    server.close();
  }
});
