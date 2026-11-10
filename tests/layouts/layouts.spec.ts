import { join } from "node:path";
import { test, expect, type BrowserContext } from "@playwright/test";
// The fixture is built against dist, as a project is: so is this spec.
import { Engine, MemPage, Trait } from "../../dist/index.js";
import { loadLayouts } from "../../dist/manifest/layouts.js";
import { App, Equipment } from "../fixtures/layouts/src/pages.js";
import { NavEquipment } from "../fixtures/layouts/src/map/app/plant/equipment/nav.block.js";
import { NavLogin } from "../fixtures/layouts/src/map/login/nav.block.js";
import { Shell } from "../fixtures/layouts/src/map/app/_layout.block.js";
import { PlantTabs } from "../fixtures/layouts/src/map/app/plant/_layout.block.js";

const PROJECT = join(import.meta.dirname, "../fixtures/layouts");

/** The page above each, as its "up" link and its breadcrumbs lead. */
const UP: Record<string, string> = { "/app/plant": "/app", "/app/plant/equipment": "/app/plant" };
/** The breadcrumbs each page shows; /app/plant/equipment's miss /app/plant when `crumbs` is "broken". */
const CRUMBS: Record<string, string[]> = { "/app/plant": ["/app"], "/app/plant/equipment": ["/app", "/app/plant"] };

/** A fake app on https://app.test: every page has the shell's links, the plant's tab and its breadcrumbs. */
async function serveApp(context: BrowserContext, crumbs: "right" | "broken" = "right"): Promise<void> {
  await context.route("https://app.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const trail = (CRUMBS[path] ?? []).filter((p) => crumbs === "right" || p !== "/app/plant");
    const link = (id: string, href: string) => `<a id="${id}" href="${href}">${id}</a>`;
    const body = [
      `<h1>${path}</h1>`,
      `<nav id="crumbs">${trail.map((p) => `<a href="${p}">${p}</a>`).join("")}</nav>`,
      UP[path] ? link("up", UP[path]) : "",
      link("home", "/app"),
      link("equipment", "/app/plant/equipment"),
      link("to-app", "/app"),
    ].join("");
    return route.fulfill({ contentType: "text/html", body });
  });
}

const engine = new Engine();

test.beforeAll(async () => {
  await loadLayouts(PROJECT);
});

test("a layout covers the pages in its folder and below; a nested one stacks; `on` names its pages", async () => {
  const loaded = Object.fromEntries((await loadLayouts(PROJECT)).map((l) => [l.name, l.covers]));
  expect(loaded).toEqual({
    shell: ["App", "Equipment", "Plant"],
    "plant-tabs": ["Equipment", "Plant"],
    banner: ["Login"],
  });
  expect((Shell.go.home as unknown as { __waygraphFrom: string[] }).__waygraphFrom).toEqual(["App", "Equipment", "Plant"]);
});

test("a link to the parent goes up the site map, page by page", async ({ browser }) => {
  const context = await browser.newContext();
  await serveApp(context);
  const page = await context.newPage();
  const flow = engine.map().gotoPage(NavEquipment).gotoPage(Shell.go.up).gotoPage(Shell.go.up);
  expect(await flow.run(context, new MemPage(), { page })).toEqual(App);
  expect(new URL(page.url()).pathname).toBe("/app");
  expect((Shell.go.up as unknown as { __waygraphTo: string[] }).__waygraphTo).toEqual(["App", "Plant"]);
  await context.close();
});

test("a nested layout's link runs on its pages", async ({ browser }) => {
  const context = await browser.newContext();
  await serveApp(context);
  const page = await context.newPage();
  const flow = engine.map().gotoPage(NavEquipment).gotoPage(Shell.go.up).gotoPage(PlantTabs.go.equipment);
  expect(await flow.run(context, new MemPage(), { page })).toEqual(Equipment);
  await context.close();
});

test("a link from a page its layout doesn't cover fails before clicking, naming the layout and the page", async ({ browser }) => {
  const context = await browser.newContext();
  await serveApp(context);
  const page = await context.newPage();
  const flow = engine.map().gotoPage(NavLogin).gotoPage(PlantTabs.go.equipment);
  const error = await flow.run(context, new MemPage(), { page }).catch((err: unknown) => err as Error);
  expect(String(error)).toContain(`plant-tabs-equipment: check "on-plant-tabs" didn't pass before it acted`);
  expect(String(error)).toContain("Login: plant-tabs isn't on it");
  expect(new URL(page.url()).pathname).toBe("/login");
  await context.close();
});

test("the breadcrumbs check passes when the crumbs lead up the site map, and names a missing crumb", async ({ browser }) => {
  for (const crumbs of ["right", "broken"] as const) {
    const context = await browser.newContext();
    await serveApp(context, crumbs);
    const page = await context.newPage();
    await page.goto("https://app.test/app/plant/equipment");
    const result = await Trait.breadcrumbs("#crumbs a").check(page, new MemPage());
    expect(result, crumbs).toEqual(crumbs === "right" ? { ok: true, saw: "/app › /app/plant" } : { ok: false, saw: "missing /app/plant" });
    await context.close();
  }
});
