import { test, expect } from "@playwright/test";
import { MemPage, checkpoint, seedMemStub } from "waygraph";
import { homeHelloFlow } from "../src/flows/home/hello.flow.js";
import { homeCartFlow } from "../src/flows/home/cart.flow.js";

test("example flow reaches Docs (home -> assert -> sibling docs/ page)", async ({ context }) => {
  const result = await homeHelloFlow.run(context, new MemPage());
  expect(result).toEqual(checkpoint("Docs"));
});

test("shop flow adds then clears (Effect + Method)", async ({ context }) => {
  const mem = new MemPage();
  seedMemStub(mem, homeCartFlow);
  const result = await homeCartFlow.run(context, mem);
  expect(result).toEqual(checkpoint("CartEmpty"));
});
