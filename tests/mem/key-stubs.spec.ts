import { test, expect } from "@playwright/test";
import { keys, MemPage, Start, checkpoint, defineMethodBlock, seedMemStub } from "../../src/index.js";
import { getMemStub } from "../../src/engine/mem/mem-stub.js";
import { map } from "../../src/engine/engine.js";

const Shop = keys("keyStubShop")<{ item: { id: string }; email: string; plain: number }>({
  item: () => ({ id: "backpack" }),
  email: ({ unique }) => `qa+${unique}@example.com`,
});

test("a key carries the fake value a run gets when none is given", () => {
  expect(getMemStub(Shop.item)?.()).toEqual({ id: "backpack" });
  expect(getMemStub(Shop.email)?.()).toMatch(/^qa\+.+@example\.com$/);
  // A key with no stub has none.
  expect(getMemStub(Shop.plain)).toBeUndefined();
});

test("seedMemStub fills the keys a flow requires from the keys' own stubs", () => {
  const Home = checkpoint("KeyStubHome");
  const Use = defineMethodBlock({ name: "key-stub-use", from: Start, to: Home, requires: [Shop.item], async act() {} });
  const mem = new MemPage();
  seedMemStub(mem, map().method(Use));
  expect(mem.get(Shop.item)).toEqual({ id: "backpack" });
});
