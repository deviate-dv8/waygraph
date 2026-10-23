import { test, expect } from "@playwright/test";
import { checkpoint, defineAssertBlock, defineMethodBlock, defineNavBlock, MemPage } from "../../src/index.js";

const Home = checkpoint("Home");
const CartEmpty = checkpoint("CartEmpty");
const ItemInCart = checkpoint("ItemInCart");

type Marked = { __waygraphFrom?: string[]; __waygraphTo?: string[] };

test("Blocks built from Checkpoint values record where they run from and land on", async () => {
  const nav = defineNavBlock({ name: "nav-home", checkpoint: Home, url: "/", from: [CartEmpty] });
  const add = defineMethodBlock({ name: "add", from: [Home, CartEmpty], to: ItemInCart, instruction: { async act() {} } });
  const seen = defineAssertBlock({ name: "seen", checkpoint: ItemInCart, verify: [] });
  expect([(nav as Marked).__waygraphFrom, (nav as Marked).__waygraphTo]).toEqual([["CartEmpty"], ["Home"]]);
  expect([(add as Marked).__waygraphFrom, (add as Marked).__waygraphTo]).toEqual([["Home", "CartEmpty"], ["ItemInCart"]]);
  expect([(seen as Marked).__waygraphFrom, (seen as Marked).__waygraphTo]).toEqual([["ItemInCart"], ["ItemInCart"]]);
  // a single `to` fills resolve
  expect(await add.instruction.resolve(undefined)).toEqual(ItemInCart);
  // markers survive chaining
  expect((add.stubAfter(() => {}) as Marked).__waygraphTo).toEqual(["ItemInCart"]);
  void MemPage;
});

test("a Block that lands on several Checkpoints must give its own resolve", () => {
  expect(() =>
    defineMethodBlock({ name: "either", from: Home, to: [ItemInCart, CartEmpty], instruction: { async act() {} } }),
  ).toThrow(/give it a resolve/);
});

test("the deprecated tag-string form still works and records the landing tag", () => {
  const nav = defineNavBlock({ name: "nav-home", checkpoint: checkpoint("Home"), url: "/" });
  expect((nav as Marked).__waygraphTo).toEqual(["Home"]);
});
