import { test, expect } from "@playwright/test";
import type { Checkpoint, Trait as TraitType } from "../../src/index.js";
import { defineNavBlock, locate } from "../../src/index.js";

type LoginPage = Checkpoint<"LoginPage">;
type DashboardPage = Checkpoint<"DashboardPage">;

const LOGIN_URL = `data:text/html,${encodeURIComponent("<h1 id='marker'>Login</h1><button id='login-button'>Log in</button>")}`;
const DASHBOARD_URL = `data:text/html,${encodeURIComponent("<h1 id='marker'>Dashboard</h1><div id='welcome'>Welcome back</div>")}`;
const NEITHER_URL = `data:text/html,${encodeURIComponent("<h1 id='marker'>Somewhere else entirely</h1>")}`;

// A short, explicit timeout - Trait.visible's own default wait has no
// override and was already found unbounded-in-practice elsewhere this
// session (see saucedemo's viewer-blocked.flow.ts); locate() genuinely
// needs to try candidates that WON'T match, so every Trait here bounds its
// own wait instead of relying on Playwright's much longer default.
function visibleFast(selector: string): TraitType {
  return {
    name: `visible-fast(${selector})`,
    async check(page) {
      return page
        .locator(selector)
        .waitFor({ state: "visible", timeout: 500 })
        .then(() => true)
        .catch(() => false);
    },
  };
}

const NavLoginBlock = defineNavBlock<LoginPage>({
  name: "nav-login",
  checkpoint: "LoginPage",
  url: LOGIN_URL,
  verify: [visibleFast("#login-button")],
});

const NavDashboardBlock = defineNavBlock<DashboardPage>({
  name: "nav-dashboard",
  checkpoint: "DashboardPage",
  url: DASHBOARD_URL,
  verify: [visibleFast("#welcome")],
});

const library = [NavLoginBlock, NavDashboardBlock];

test("locate: identifies the live page as the first NavBlock whose verify Traits all pass", async ({ page }) => {
  await page.goto(DASHBOARD_URL);

  expect(await locate(page, library)).toBe("DashboardPage");
});

test("locate: tries every NavBlock in the library, not just the first", async ({ page }) => {
  await page.goto(LOGIN_URL);

  expect(await locate(page, library)).toBe("LoginPage");
});

test("locate: returns null when no NavBlock's verify matches the live page", async ({ page }) => {
  await page.goto(NEITHER_URL);

  expect(await locate(page, library)).toBeNull();
});

test("locate: a NavBlock whose verify throws (e.g. a timed-out wait) is treated as no match, not a crash", async ({
  page,
}) => {
  await page.goto(NEITHER_URL);
  const flaky = defineNavBlock<Checkpoint<"Flaky">>({
    name: "nav-flaky",
    checkpoint: "Flaky",
    url: NEITHER_URL,
    verify: [
      {
        name: "always-throws",
        async check() {
          throw new Error("simulated timeout");
        },
      },
    ],
  });

  expect(await locate(page, [flaky, NavLoginBlock])).toBeNull();
});
