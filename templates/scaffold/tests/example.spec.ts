import { test, expect } from "@playwright/test";
import { MemPage, checkpoint, seedMemStub } from "waygraph";
import { exampleFlow } from "../src/flows/example.flow.js";
import { shopFlow } from "../src/flows/shop.flow.js";

test("example flow reaches Docs (home -> assert -> sibling docs/ page)", async ({ context }) => {
  const result = await exampleFlow.run(context, new MemPage());
  expect(result).toEqual(checkpoint("Docs"));
});

test("shop flow adds then clears (Effect + Method)", async ({ context }) => {
  const mem = new MemPage();
  seedMemStub(mem, shopFlow);
  const result = await shopFlow.run(context, mem);
  expect(result).toEqual(checkpoint("CartEmpty"));
});
