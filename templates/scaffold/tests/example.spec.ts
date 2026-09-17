import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { exampleFlow } from "../src/flows/example.flow.js";
import { shopFlow } from "../src/flows/shop.flow.js";
import { SelectedItem } from "../src/states/demo.mem-keys.js";

test("example flow reaches HomeVerified", async ({ context }) => {
  const result = await exampleFlow.run(context, new MemPage());
  expect(result).toEqual(checkpoint("HomeVerified"));
});

test("shop flow adds then clears (Effect + Method)", async ({ context }) => {
  const mem = new MemPage();
  mem.set(SelectedItem.key, { id: "alpha", name: "Alpha" });
  const result = await shopFlow.run(context, mem);
  expect(result).toEqual(checkpoint("CartEmpty"));
});
