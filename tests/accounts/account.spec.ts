import { test, expect, type BrowserContext } from "@playwright/test";
import { account, checkpoint, defineMethodBlock, defineNavBlock, Engine, forgetSessions, MemPage } from "../../src/index.js";

const LoginPage = checkpoint("LoginPage");
const InventoryPage = checkpoint("InventoryPage");
const Home = checkpoint("Home");

/** A fake app on https://app.test: any path serves a page that shows whether the visitor has a session. */
async function serveApp(context: BrowserContext): Promise<void> {
  await context.route("https://app.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<h1 id="who"></h1><script>document.getElementById("who").textContent = document.cookie.includes("sid=") ? "signed in" : "guest";</script>`,
    }),
  );
}

let signIns = 0;
const NavLogin = defineNavBlock({ name: "nav-login", checkpoint: LoginPage, url: "https://app.test/login" });
const SubmitLogin = defineMethodBlock({
  name: "submit-login",
  from: LoginPage,
  to: InventoryPage,
  instruction: {
    async act(page) {
      signIns++;
      await page.evaluate(() => {
        document.cookie = "sid=planner-1; path=/";
        localStorage.setItem("token", "t-planner");
      });
    },
  },
});
const engine = new Engine();
const Planner = account("planner", { signIn: engine.map().gotoPage(NavLogin).method(SubmitLogin) });
const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: "https://app.test/home" });
const homeAsPlanner = engine.map({ as: Planner }).gotoPage(NavHome);

test.beforeEach(() => {
  forgetSessions();
  signIns = 0;
});

test("a flow as an account signs in once; later flows as it reuse the session", async ({ browser }) => {
  for (const run of [1, 2]) {
    // A fresh browser each time, as a second flow in another worker or a later CLI run would get.
    const context = await browser.newContext();
    await serveApp(context);
    const page = await context.newPage();
    expect(await homeAsPlanner.run(context, new MemPage(), { page })).toEqual(Home);
    await expect(page.locator("#who"), `run ${run}`).toHaveText("signed in");
    expect(await page.evaluate(() => localStorage.getItem("token")), `run ${run}`).toBe("t-planner");
    await context.close();
  }
  expect(signIns).toBe(1);
  expect(homeAsPlanner.blocks().map((b) => b.name)).toEqual(["sign-in-as-planner", "nav-home"]);
});

test("forgetSessions makes the next flow sign in again", async ({ browser }) => {
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext();
    await serveApp(context);
    await homeAsPlanner.run(context, new MemPage(), { page: await context.newPage() });
    await context.close();
    forgetSessions();
  }
  expect(signIns).toBe(2);
});

const signInFlow = engine.map().gotoPage(NavLogin).method(SubmitLogin);

/** Plays `flow` in a fresh browser, as another worker or a later run would. */
async function playIn(browser: import("@playwright/test").Browser, flow: typeof homeAsPlanner): Promise<void> {
  const context = await browser.newContext();
  await serveApp(context);
  await flow.run(context, new MemPage(), { page: await context.newPage() });
  await context.close();
}

test("an account with a ttl signs in again once its session is older than that", async ({ browser }) => {
  const Brief = account("brief", { signIn: signInFlow, ttl: 2000 });
  const home = engine.map({ as: Brief }).gotoPage(NavHome);
  await playIn(browser, home);
  await playIn(browser, home);
  expect(signIns).toBe(1);
  await new Promise((r) => setTimeout(r, 2100));
  await playIn(browser, home);
  expect(signIns).toBe(2);
});

test.describe("saved sessions", () => {
  test.describe.configure({ mode: "serial" });
  let dir = "";
  test.beforeEach(async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    dir = mkdtempSync(`${tmpdir()}/waygraph-sessions-`);
    process.env.WAYGRAPH_SESSIONS = dir;
  });
  test.afterEach(async () => {
    delete process.env.WAYGRAPH_SESSIONS;
    delete process.env.WAYGRAPH_FRESH_SESSIONS;
    const { rmSync } = await import("node:fs");
    rmSync(dir, { recursive: true, force: true });
  });

  test("an account with a ttl saves its session for a later run, readable only by its owner", async ({ browser }) => {
    const { readdirSync, statSync } = await import("node:fs");
    const Saved = account("saved", { signIn: signInFlow, ttl: "15m" });
    const home = engine.map({ as: Saved }).gotoPage(NavHome);
    await playIn(browser, home);
    forgetSessions(); // a new process: nothing kept in memory
    await playIn(browser, home);
    expect(signIns).toBe(1);
    const [file] = readdirSync(dir);
    expect(file).toMatch(/^saved-[0-9a-f]{12}\.json$/);
    expect(statSync(`${dir}/${file}`).mode & 0o777).toBe(0o600);
  });

  test("--fresh-sessions signs in again and saves the new session; an account without a ttl saves nothing", async ({ browser }) => {
    const { readdirSync } = await import("node:fs");
    const Saved = account("saved", { signIn: signInFlow, ttl: "15m" });
    const home = engine.map({ as: Saved }).gotoPage(NavHome);
    await playIn(browser, home);
    forgetSessions();
    process.env.WAYGRAPH_FRESH_SESSIONS = "1";
    await playIn(browser, home);
    expect(signIns).toBe(2);
    await playIn(browser, homeAsPlanner); // Planner has no ttl
    expect(readdirSync(dir)).toEqual([expect.stringMatching(/^saved-/)]);
  });
});

test("a ttl is ms or a number of s, m, h or d", () => {
  expect(() => account("bad", { signIn: signInFlow, ttl: "15 minutes" as "15m" })).toThrow(/a ttl is a number of ms or "30s"/);
  expect(account("hours", { signIn: signInFlow, ttl: "2h" }).ttlMs).toBe(7_200_000);
  expect(account("ms", { signIn: signInFlow, ttl: 1500 }).ttlMs).toBe(1500);
});
