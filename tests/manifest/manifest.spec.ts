import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { buildManifest } from "../../src/manifest/manifest.js";

const examples = join(import.meta.dirname, "../../examples");

test("the manifest lists every Block with its route, every flow with its steps", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  expect(m.version).toBe(2);
  const submit = m.blocks.find((b) => b.name === "submit-login")!;
  expect(submit).toMatchObject({ kind: "method", from: ["LoginPage"], to: ["InventoryPage", "LoginPage"] });
  expect(m.blocks.find((b) => b.name === "page-cart")).toMatchObject({ kind: "page", from: ["*"], to: ["CartPage"] });
  expect(m.checkpoints).toContain("OrderComplete");
  const shop = m.flows.find((f) => f.exportName === "shopFlow")!;
  expect(shop.steps.slice(0, 2)).toEqual(["sign-in-as-standard-user", "page-inventory"]);
  expect(shop.settings).toMatchObject({ memStub: true });
  // JSON-serializable: no Block objects or functions leak in
  expect(JSON.parse(JSON.stringify(m))).toEqual(m);
});

test("the manifest lists each page's read with the Checkpoint it reads and the shape of what it returns", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  expect(m.readBlocks.find((r) => r.name === "read-page-inventory" || r.name === "read-inventory")).toMatchObject({
    from: ["InventoryPage"],
    fields: { "catalog.items": [{ name: "string", price: "number", inCart: "boolean" }], "catalog.sort": "string" },
    file: "src/map/(shop)/inventory.html/_page.block.ts",
  });
  // What every page of the layout shows is the layout's read.
  expect(m.readBlocks.find((r) => r.name === "read-menu")).toMatchObject({ fields: { "header.title": "string", "header.cartCount": "unknown" } });
  // Read Blocks are not graph steps
  expect(m.blocks.some((b) => b.name.startsWith("read-"))).toBe(false);
});

test("Blocks under src/map/ carry their map group", async () => {
  const m = await buildManifest(join(examples, "routed-demo"));
  expect(m.maps.length).toBeGreaterThan(0);
  expect(m.blocks.every((b) => b.map !== undefined)).toBe(true);
});

test("each Block carries the lines that define it, its checks as data and the selector entries it reads", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  const nav = m.blocks.find((b) => b.name === "page-cart")!;
  expect(nav.source).toEqual({ line: 5, endLine: 22 });
  expect(nav.checks).toEqual({ precondition: [], verify: [{ name: 'url-matches({"pathname":"/cart.html"})' }] });
  expect(nav.selectors).toEqual([
    { name: "CartSel.cartLink", selector: ".shopping_cart_link", literal: true, file: "src/map/(shop)/cart.html/_sel.ts", line: 3 },
  ]);
  expect(m.flows.every((f) => f.source)).toBe(true);
  expect(m.readBlocks.every((r) => r.source)).toBe(true);
  // Every selector file's entries, used or not
  expect(m.selectors).toContainEqual(expect.objectContaining({ name: "CartSel.checkoutBtn", selector: "#checkout" }));
});

test("each flow carries its labels from the config's labels", async () => {
  const m = await buildManifest(join(examples, "saucedemo"), { labels: { auth: ["src/flows/auth/login.flow.ts"], smoke: ["shopFlow"] } });
  expect(m.flows.find((f) => f.exportName === "loginFlow")?.labels).toEqual(["auth", "smoke"]);
  expect(m.flows.find((f) => f.exportName === "shopFlow")?.labels).toEqual(["cart", "checkout", "smoke"]);
  expect(m.flows.find((f) => f.exportName === "cartBulkFlow")?.labels).toEqual(["cart"]);
});

test("a flow with panes lists them, and each step's pane", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  const two = m.flows.find((f) => f.exportName === "twoShoppersFlow")!;
  expect(two.panes).toEqual([
    { name: "standard", as: "standard-user" },
    { name: "problem", as: "problem-user" },
  ]);
  expect(two.steps).toEqual(["page-inventory", "add-to-cart", "page-inventory", "page-cart", "page-cart", "close-problem", "page-inventory"]);
  expect(two.stepPanes).toEqual(["standard", "standard", "problem", "problem", "standard", "standard", "standard"]);
  expect(m.accounts).toEqual(expect.arrayContaining(["problem-user", "standard-user"]));
  expect(m.flows.find((f) => f.exportName === "shopFlow")!.panes).toBeUndefined();
});

test("the manifest lists each page with what it holds: moves by key, what it covers, and a Block's place in its page", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  const login = m.pages.find((p) => p.checkpoint === "LoginPage")!;
  expect(login).toMatchObject({ opensBy: "url", read: "read-login" });
  expect(login.do.map((d) => d.key)).toEqual(["fillUsername", "fillPassword", "submitLogin"]);
  const menu = m.pages.find((p) => p.name === "menu")!;
  expect(menu).toMatchObject({ bare: true, links: [{ key: "allItems", to: "InventoryPage" }, { key: "logout", to: "LoginPage" }] });
  expect(menu.coveredPages).toContain("CartPage");
  expect(m.pages.find((p) => p.checkpoint === "CartPage")?.coveredBy).toEqual(["menu"]);
  const fill = m.blocks.find((b) => b.name === "fill-username")!;
  expect(fill).toMatchObject({ group: "do", key: "fillUsername", owner: expect.stringContaining("#Login") });
  // The Block's own lines, not the whole page's.
  expect(fill.source!.endLine - fill.source!.line).toBeLessThan(15);
  expect(JSON.parse(JSON.stringify(m))).toEqual(m);
});
