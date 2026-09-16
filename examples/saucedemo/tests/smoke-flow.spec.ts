import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { smokeFlow } from "../src/flows/smoke.flow.js";
import { LoginCreds, SelectedItem } from "../src/states/checkout.mem-keys.js";

test("smoke flow reuses login + add-to-cart with navigation-only confirmation, no DOM checks", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));
  mem.set(SelectedItem({ id: "sauce-labs-backpack", name: "Sauce Labs Backpack" }));

  const result = await smokeFlow.run(mem, { headless: true });

  expect(result).toEqual(checkpoint("ItemInCart"));
});
