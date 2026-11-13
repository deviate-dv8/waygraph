import { test, expect } from "@playwright/test";
import { installPersistentPilotOverlay } from "../../dist/demo/overlay/pilot/shell.js";

// The pilot's coverage chip: on a page you browse by hand, what waygraph knows is outlined green (labelled with its name, or
// the page a link goes to) and what a person can click or type in that nothing registers is outlined orange.
const html = `<!doctype html><h1>Shop</h1>
<button id="reg">Registered</button> <button id="loose">Loose</button>
<a href="/items/7">Known item</a> <a href="/nowhere">Unknown link</a> <input id="q" />`;

test("the coverage chip outlines registered elements and the ones nothing registers", async ({ context }) => {
  await installPersistentPilotOverlay(context, {
    entries: [{ selector: "#reg", name: "HomeSel.press", owner: "page-home", where: "src/map/_sel.ts:5" }, { selector: "#q", name: "" }],
    paths: ["/items/:id"],
  });
  const page = await context.newPage();
  await page.route("http://app.test/**", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://app.test/");
  const root = page.locator("#wg-root");
  await expect(root.locator("#wg-coverage-chip")).toContainText("Coverage");
  expect(await root.locator(".wg-coverage-box").count()).toBe(0);
  await root.locator("#wg-coverage-chip").click();
  // #reg and #q registered; the link to /items/7 is a registered page; #loose and /nowhere are not.
  await expect(root.locator("#wg-coverage-chip")).toContainText("3 registered, 2 not");
  await expect(root.locator(".wg-coverage-box").filter({ hasText: "HomeSel.press · page-home" })).toHaveCount(1);
  await expect(root.locator(".wg-coverage-box span[title]").first()).toHaveAttribute("title", /src\/map\/_sel.ts:5/);
  await expect(root.locator(".wg-coverage-box").filter({ hasText: "not registered" })).toHaveCount(2);
  await expect(root.locator(".wg-coverage-box").filter({ hasText: "page /items/7" })).toHaveCount(1);
  await page.screenshot({ path: "/tmp/coverage.png" });
  await root.locator("#wg-coverage-chip").click();
  await expect(root.locator(".wg-coverage-box")).toHaveCount(0);
});

test("clicking an orange tag names the element and registers it through the session", async ({ context }) => {
  await installPersistentPilotOverlay(context, { entries: [], paths: [] });
  const saved: { selector: string; key: string }[] = [];
  await context.exposeBinding("__wgRegister", (_source, arg: { selector: string; key: string }) => {
    saved.push(arg);
    return `saved HomeSel.${arg.key}`;
  });
  const page = await context.newPage();
  await page.route("http://app.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><button id="loose">Loose</button>` }));
  await page.goto("http://app.test/");
  const root = page.locator("#wg-root");
  await root.locator("#wg-coverage-chip").click();
  await root.locator(".wg-coverage-box span").first().click();
  await root.locator(".wg-coverage-box input").fill("looseBtn");
  await root.locator(".wg-coverage-box input").press("Enter");
  await expect(root.locator(".wg-coverage-box span").first()).toHaveText("saved HomeSel.looseBtn");
  expect(saved).toEqual([{ selector: "#loose", key: "looseBtn" }]);
});
