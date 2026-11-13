import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

// A demo step's HTTP calls (the page's and an API Block's) are on its card, each with its status in words.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-demo-calls");
let server: Server;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/") res.writeHead(200, { "content-type": "text/html" }).end(`<h1 id="t">Shop</h1><script>fetch("/api/items/1").then((r) => r.text()).then(() => (document.title = "loaded"))</script>`);
    else if (req.url?.startsWith("/api/items")) res.writeHead(200, { "content-type": "application/json" }).end(`{"id":1}`);
    else if (req.url === "/api/seed") res.writeHead(201, { "content-type": "application/json" }).end(`{"id":7}`);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await mkdir(join(dir, "src", "map", "home"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  await writeFile(
    join(dir, "src", "map", "home", "home.block.ts"),
    `import { checkpoint, defineApiBlock, defineNavBlock, Trait } from "waygraph";
export const Home = checkpoint("Home");
export const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: ${JSON.stringify(origin)}, verify: [Trait.visible("#t")] });
export const Seed = defineApiBlock({
  name: "seed",
  method: "POST",
  from: Home,
  to: Home,
  call: ({ request }) => request.post(${JSON.stringify(origin + "/api/seed")}, { data: { title: "x" } }),
});
`,
  );
  await writeFile(
    join(dir, "src", "flows", "calls.flow.ts"),
    `import { map } from "waygraph";
import { NavHome, Seed } from "../map/home/home.block.js";
export const callsFlow = map().gotoPage(NavHome).method(Seed.stub((ctx) => ctx.ui.showCalls()));
`,
  );
});

test.afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

test("a step's calls are on its card, with their status in words", async () => {
  test.setTimeout(90_000);
  let log = "";
  try {
    const out = await exec(process.execPath, [CLI, "demo", "callsFlow", dir, "--auto-next", "--fast"], { env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0" }, timeout: 80_000 });
    log = out.stdout + out.stderr;
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    log = (failed.stdout ?? "") + (failed.stderr ?? "");
  }
  expect(log).toMatch(/called GET \/api\/items\/:id -> 200 OK/);
  expect(log).toMatch(/called POST \/api\/seed -> 201 Created/);
  expect(log).toMatch(/finished: passed/);
});
