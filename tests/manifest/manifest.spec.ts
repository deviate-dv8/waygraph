import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { buildManifest } from "../../src/manifest/manifest.js";

const examples = join(import.meta.dirname, "../../examples");

test("the manifest lists every Block with its route, every flow with its steps", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  expect(m.version).toBe(2);
  const submit = m.blocks.find((b) => b.name === "submit-login")!;
  expect(submit).toMatchObject({ kind: "method", from: ["LoginPage"], to: ["InventoryPage", "LoginPage"] });
  expect(m.blocks.find((b) => b.name === "nav-cart")).toMatchObject({ kind: "nav", from: ["*"], to: ["CartPage"] });
  expect(m.checkpoints).toContain("OrderComplete");
  const shop = m.flows.find((f) => f.exportName === "shopFlow")!;
  expect(shop.steps[0]).toBe("add-to-cart");
  expect(shop.settings).toMatchObject({ memStub: true });
  // JSON-serializable: no Block objects or functions leak in
  expect(JSON.parse(JSON.stringify(m))).toEqual(m);
});

test("the manifest lists each Read Block with the Checkpoints it reads and the shape of what it returns", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  expect(m.readBlocks.find((r) => r.name === "read-inventory")).toMatchObject({
    from: ["InventoryPage"],
    fields: { "catalog.items": [{ name: "string", price: "number", inCart: "boolean" }], "catalog.sort": "string" },
    file: "src/blocks/saucedemo-web/inventory/inventory.read.block.ts",
  });
  expect(m.readBlocks.find((r) => r.name === "read-header")).toMatchObject({ from: ["*"], fields: { "header.title": "string", "header.cartCount": "unknown" } });
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
  const nav = m.blocks.find((b) => b.name === "nav-cart")!;
  expect(nav.source).toEqual({ line: 5, endLine: 18 });
  expect(nav.checks).toEqual({ precondition: [], verify: [{ name: 'url-matches({"pathname":"/cart.html"})' }] });
  expect(nav.selectors).toEqual([
    { name: "CartSel.cartLink", selector: ".shopping_cart_link", literal: true, file: "src/blocks/saucedemo-web/cart/cart.sel.ts", line: 7 },
  ]);
  expect(m.flows.every((f) => f.source)).toBe(true);
  expect(m.readBlocks.every((r) => r.source)).toBe(true);
  // Every selector file's entries, used or not
  expect(m.selectors).toContainEqual(expect.objectContaining({ name: "CartSel.checkoutBtn", selector: "#checkout" }));
});

test("each flow carries its labels from the config's labels", async () => {
  const m = await buildManifest(join(examples, "saucedemo"), { labels: { auth: ["src/flows/auth/login.flow.ts"], smoke: ["shopFlow"] } });
  expect(m.flows.find((f) => f.exportName === "loginFlow")?.labels).toEqual(["auth"]);
  expect(m.flows.find((f) => f.exportName === "shopFlow")?.labels).toEqual(["smoke"]);
  expect(m.flows.find((f) => f.exportName === "cartBulkFlow")?.labels).toEqual([]);
});

test("a flow with panes lists them, and each step's pane", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  const two = m.flows.find((f) => f.exportName === "twoShoppersFlow")!;
  expect(two.panes).toEqual([
    { name: "standard", as: "standard-user" },
    { name: "problem", as: "problem-user" },
  ]);
  expect(two.stepPanes).toEqual(["standard", "standard", "problem", "standard"]);
  expect(m.accounts).toEqual(expect.arrayContaining(["problem-user", "standard-user"]));
  expect(m.flows.find((f) => f.exportName === "shopFlow")!.panes).toBeUndefined();
});
