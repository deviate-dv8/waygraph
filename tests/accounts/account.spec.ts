import { test, expect, type BrowserContext } from "@playwright/test";
import { account, checkpoint, defineMethodBlock, defineNavBlock, Engine, forgetSessions, MemPage } from "../../src/index.js";

const LoginPage = checkpoint("LoginPage");
const LoggedIn = checkpoint("LoggedIn");
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
  to: LoggedIn,
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
const Planner = account("planner", { signIn: engine.map().gotoPage(NavLogin).method(SubmitLogin).end() });
const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: "https://app.test/home" });
const homeAsPlanner = engine.map({ as: Planner }).gotoPage(NavHome).end();

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
