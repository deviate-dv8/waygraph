import { test, expect } from "@playwright/test";
import { checkpoint, defineMethodBlock, Engine, MemPage, type Checkpoint } from "../../src/index.js";

const LoginPage = checkpoint("LoginPage");
const InventoryPage = checkpoint("InventoryPage");
const Locked = checkpoint("Locked");

/** A submit that lands on InventoryPage or back on LoginPage, as the page says. */
const submit = (lands: Checkpoint<"InventoryPage"> | Checkpoint<"LoginPage">) =>
  defineMethodBlock({ name: "submit-login", from: LoginPage, to: [InventoryPage, LoginPage], instruction: { async act() {}, resolve: () => lands } });
const onLoggedIn = defineMethodBlock({ name: "open-cart", from: InventoryPage, to: InventoryPage, instruction: { async act() {}, resolve: () => InventoryPage } });
const start = defineMethodBlock({ name: "open-login", to: LoginPage, instruction: { async act() {}, resolve: () => LoginPage } });

test("lands: the flow continues from the named outcome", async ({ page }) => {
  // Typed: open-cart starts from InventoryPage, which only `lands` makes the flow's Checkpoint here.
  const flow = new Engine().map().method(start).method(submit(InventoryPage), { lands: InventoryPage }).method(onLoggedIn);
  expect(await flow.run(page.context(), new MemPage(), { page })).toEqual(InventoryPage);
});

test("lands: a run where the Block lands elsewhere fails at that step, naming both", async ({ page }) => {
  const flow = new Engine().map().method(start).method(submit(LoginPage), { lands: InventoryPage }).method(onLoggedIn);
  await expect(flow.run(page.context(), new MemPage(), { page })).rejects.toThrow('"submit-login" landed on LoginPage, but this flow continues from InventoryPage');
});

test("lands: a Checkpoint the Block never lands on is rejected when the flow is built", () => {
  const map = new Engine().map().method(start);
  // @ts-expect-error Locked is not one of submit-login's outcomes
  expect(() => map.method(submit(InventoryPage), { lands: Locked })).toThrow('"submit-login" never lands on Locked - its outcomes are InventoryPage, LoginPage');
});

test("without lands, a step after a branching Block must accept every outcome", () => {
  const map = new Engine().map().method(start).method(submit(InventoryPage));
  // @ts-expect-error open-cart only starts from InventoryPage; the flow may be on LoginPage
  expect(() => map.method(onLoggedIn)).not.toThrow();
});
