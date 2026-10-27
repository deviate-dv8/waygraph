import { test, expect } from "@playwright/test";
import { checkpoint, defineMethodBlock, Engine, MemPage, type Checkpoint } from "../../src/index.js";

const LoginPage = checkpoint("LoginPage");
const LoggedIn = checkpoint("LoggedIn");
const Locked = checkpoint("Locked");

/** A submit that lands on LoggedIn or back on LoginPage, as the page says. */
const submit = (lands: Checkpoint<"LoggedIn"> | Checkpoint<"LoginPage">) =>
  defineMethodBlock({ name: "submit-login", from: LoginPage, to: [LoggedIn, LoginPage], instruction: { async act() {}, resolve: () => lands } });
const onLoggedIn = defineMethodBlock({ name: "open-cart", from: LoggedIn, to: LoggedIn, instruction: { async act() {}, resolve: () => LoggedIn } });
const start = defineMethodBlock({ name: "open-login", to: LoginPage, instruction: { async act() {}, resolve: () => LoginPage } });

test("lands: the flow continues from the named outcome", async ({ page }) => {
  // Typed: open-cart starts from LoggedIn, which only `lands` makes the flow's Checkpoint here.
  const flow = new Engine().map().start().method(start).method(submit(LoggedIn), { lands: LoggedIn }).method(onLoggedIn).end();
  expect(await flow.run(page.context(), new MemPage(), { page })).toEqual(LoggedIn);
});

test("lands: a run where the Block lands elsewhere fails at that step, naming both", async ({ page }) => {
  const flow = new Engine().map().start().method(start).method(submit(LoginPage), { lands: LoggedIn }).method(onLoggedIn).end();
  await expect(flow.run(page.context(), new MemPage(), { page })).rejects.toThrow('"submit-login" landed on LoginPage, but this flow continues from LoggedIn');
});

test("lands: a Checkpoint the Block never lands on is rejected when the flow is built", () => {
  const map = new Engine().map().start().method(start);
  // @ts-expect-error Locked is not one of submit-login's outcomes
  expect(() => map.method(submit(LoggedIn), { lands: Locked })).toThrow('"submit-login" never lands on Locked - its outcomes are LoggedIn, LoginPage');
});

test("without lands, a step after a branching Block must accept every outcome", () => {
  const map = new Engine().map().start().method(start).method(submit(LoggedIn));
  // @ts-expect-error open-cart only starts from LoggedIn; the flow may be on LoginPage
  expect(() => map.method(onLoggedIn)).not.toThrow();
});
