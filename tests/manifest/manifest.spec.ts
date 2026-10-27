import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { buildManifest } from "../../src/manifest/manifest.js";

const examples = join(import.meta.dirname, "../../examples");

test("the manifest lists every Block with its route, every flow with its steps", async () => {
  const m = await buildManifest(join(examples, "saucedemo"));
  expect(m.version).toBe(2);
  const submit = m.blocks.find((b) => b.name === "submit-login")!;
  expect(submit).toMatchObject({ kind: "method", from: ["LoginPage"], to: ["LoggedIn", "LoginPage"] });
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
    from: ["LoggedIn", "ItemInCart"],
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
