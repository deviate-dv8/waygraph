import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// --compare: one flow played twice, side by side, step by step; the run says where the two sides differ, and a side
// that fails stops while the other plays on.
const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-compare");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mkdir(join(dir, "src", "map", "app"), { recursive: true });
  await mkdir(join(dir, "src", "flows"), { recursive: true });
  await mkdir(join(dir, "src", "accounts"), { recursive: true });
  // The page says how wide it is, and shows an Admin button to the admin (who signed in with ?role=admin).
  await writeFile(
    join(dir, "index.html"),
    `<h1 id="title">App</h1><p>Width: <span id="width"></span></p><button id="admin" hidden>Admin</button>
<script>const role = new URLSearchParams(location.search).get("role");
if (role) localStorage.setItem("role", role);
document.getElementById("width").textContent = String(innerWidth);
document.getElementById("admin").hidden = localStorage.getItem("role") !== "admin";</script>`,
  );
  const url = pathToFileURL(join(dir, "index.html")).href;
  await writeFile(
    join(dir, "src", "map", "app", "app.block.ts"),
    `import { checkpoint, defineMethodBlock, defineNavBlock, defineReadBlock, reads, Trait } from "waygraph";
export const App = checkpoint("App");
export const NavApp = defineNavBlock({ name: "nav-app", checkpoint: App, url: ${JSON.stringify(url)}, verify: [Trait.visible("#title")] });
export const SignInAs = (role: string) => defineNavBlock({ name: "sign-in-" + role, checkpoint: App, url: ${JSON.stringify(url)} + "?role=" + role });
export const OpenAdmin = defineMethodBlock({
  name: "open-admin",
  from: App,
  to: App,
  instruction: { async act(page) { await page.locator("#admin").click({ timeout: 2000 }); } },
});
export const Screen = reads("screen")<{ width: number }>();
export const ReadApp = defineReadBlock({ name: "read-app", from: [App], instruction: { read: (ctx) => Screen({ width: ctx.page.number("#width") }) } });
`,
  );
  await writeFile(
    join(dir, "src", "accounts", "accounts.ts"),
    `import { account, map } from "waygraph";
import { SignInAs } from "../map/app/app.block.js";
export const Planner = account("planner", { signIn: map().gotoPage(SignInAs("planner")) });
export const Admin = account("admin", { signIn: map().gotoPage(SignInAs("admin")) });
`,
  );
  await writeFile(
    join(dir, "src", "flows", "app.flow.ts"),
    `import { map } from "waygraph";
import { NavApp, OpenAdmin } from "../map/app/app.block.js";
export const viewFlow = map().gotoPage(NavApp).gotoPage(NavApp);
export const adminFlow = map().gotoPage(NavApp).method(OpenAdmin).gotoPage(NavApp);
export const panesFlow = map({ panes: { main: {}, side: { with: "main" } } }).in("main").gotoPage(NavApp).in("side").gotoPage(NavApp).in("main").close("side");
`,
  );
});

test.afterAll(() => rm(dir, { recursive: true, force: true }));

const run = (args: string[]) =>
  exec(process.execPath, [CLI, "run", ...args, dir], { env: { ...process.env, WAYGRAPH_HEADED: "0", FORCE_COLOR: "0", WAYGRAPH_RUN_LOG: join(dir, "runs") }, timeout: 90_000 }).then(
    ({ stdout }) => ({ code: 0, stdout }),
    (err: { code: number; stdout: string }) => ({ code: err.code, stdout: err.stdout }),
  );

test("two devices: both pass, and the run says which field reads differently", async () => {
  test.setTimeout(100_000);
  const { code, stdout } = await run(["viewFlow", "--compare", "device=desktop,mobile"]);
  expect(code).toBe(0);
  expect(stdout).toContain("waygraph compare (device desktop | mobile): 2 steps differ");
  // The phone side is a phone: a page with no <meta viewport> lays out 980 pixels wide on it, as on a real one.
  expect(stdout).toContain("step 1 nav-app: screen.width: 1280 | 980");
  // The run log has each difference.
  const log = (await readdir(join(dir, "runs"))).find((f) => f.endsWith(".jsonl"))!;
  const diffs = (await readFile(join(dir, "runs", log), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "compare:diff");
  expect(diffs[0]).toMatchObject({ step: 1, block: "nav-app", sides: ["desktop", "mobile"], diffs: [{ what: "read", key: "screen.width", values: [1280, 980] }] });
});

test("two accounts: a step only one can take fails that side; the other plays on, and the run fails", async () => {
  test.setTimeout(100_000);
  const { code, stdout } = await run(["adminFlow", "--compare", "as=planner,admin"]);
  expect(code).not.toBe(0);
  expect(stdout).toMatch(/step 2 open-admin: outcome: .*\| passed/);
  // The admin side went on to the last step.
  const log = (await readdir(join(dir, "runs"))).filter((f) => f.endsWith(".jsonl")).sort().at(-1)!;
  const starts = (await readFile(join(dir, "runs", log), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "step:start" && e.pane);
  expect(starts.map((e) => `${e.pane}:${e.block}`)).toEqual([
    "planner:sign-in-as-planner",
    "planner:nav-app",
    "admin:sign-in-as-admin",
    "admin:nav-app",
    "planner:open-admin",
    "admin:open-admin",
    "admin:nav-app",
  ]);
});

test("a flow with panes compares too: each pane once per side", async () => {
  test.setTimeout(100_000);
  const { code, stdout } = await run(["panesFlow", "--compare", "device=desktop,mobile"]);
  expect(code).toBe(0);
  expect(stdout).toContain("step 1 nav-app: screen.width: 1280 | 980");
  const log = (await readdir(join(dir, "runs"))).filter((f) => f.endsWith(".jsonl")).sort().at(-1)!;
  const starts = (await readFile(join(dir, "runs", log), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "step:start" && e.pane);
  expect(starts.map((e) => `${e.pane}:${e.block}`)).toEqual([
    "main (desktop):nav-app",
    "main (mobile):nav-app",
    "side (desktop):nav-app",
    "side (mobile):nav-app",
    "main (desktop):close-side (desktop)",
    "main (mobile):close-side (mobile)",
  ]);
});
