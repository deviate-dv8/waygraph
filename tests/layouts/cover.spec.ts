import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { Engine, MemPage } from "../../dist/index.js";
import { loadLayouts } from "../../dist/manifest/layouts.js";
import { Header } from "../fixtures/shells/src/map/top/_page.block.js";
import { App } from "../fixtures/shells/src/map/app/_page.block.js";
import { Docs } from "../fixtures/shells/src/map/app/docs/_page.block.js";
import { Settings } from "../fixtures/shells/src/map/app/settings/_page.block.js";

const PROJECT = join(import.meta.dirname, "../fixtures/shells");

test("a page that covers its children is the layout of the pages below it: its links run from each of them", async ({ browser }) => {
  const loaded = await loadLayouts(PROJECT);
  expect(Object.fromEntries(loaded.map((l) => [l.name, l.covers]))).toEqual({
    "shell-app": ["ShellApp", "ShellDocs", "ShellSettings"],
    "header-shell": ["ShellDocs", "ShellSettings"],
  });
  const context = await browser.newContext();
  await context.route("https://app.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<a id="docs" href="/app/docs">d</a><a id="settings" href="/app/settings">s</a>` }),
  );
  const page = await context.newPage();
  const flow = new Engine().map().gotoPage(Docs).gotoPage(App.links.settings).gotoPage(App.links.docs);
  expect(await flow.run(context, new MemPage(), { page })).toEqual({ __state: "ShellDocs" });
  expect(Header.links.home.name).toBe("header-shell-home");
  expect(Settings.checkpoint.__state).toBe("ShellSettings");
  await context.close();
});
