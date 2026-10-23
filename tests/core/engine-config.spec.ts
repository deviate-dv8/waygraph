import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine, MemPage, checkpoint, defineConfig, defineNavBlock } from "../../src/index.js";
import type { Checkpoint } from "../../src/index.js";
import { buildFlow } from "../../src/engine/flow/flow.js";

type Home = Checkpoint<"Home">;

function fakeExtension(): string {
  const dir = mkdtempSync(join(tmpdir(), "wg-engine-ext-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ manifest_version: 3, name: "Fake", version: "1", content_scripts: [{ matches: ["<all_urls>"], js: ["mark.js"] }] }),
  );
  writeFileSync(join(dir, "mark.js"), 'document.documentElement.dataset.fakeExt = "on";');
  return dir;
}

test("new Engine(config) applies the config's baseUrl and extensions to the browser it launches", async () => {
  const server = createServer((_, res) => res.end("<html><body>hi</body></html>"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const config = defineConfig({
      baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      extensions: [fakeExtension()],
    });
    const NavHome = defineNavBlock<Home>({
      name: "nav-home",
      checkpoint: "Home",
      url: "/",
      verify: [
        {
          name: "extension-ran",
          check: async (page) => (await page.evaluate(() => document.documentElement.dataset.fakeExt)) === "on",
        },
      ],
    });
    const flow = buildFlow([NavHome], new Engine(config).config);
    expect(await flow.run(new MemPage())).toEqual(checkpoint("Home"));
  } finally {
    server.close();
  }
});
