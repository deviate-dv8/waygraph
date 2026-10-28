import { test, expect } from "@playwright/test";
import { MemPage, checkpoint, Trait } from "waygraph";
import { checkoutFlow } from "../src/flows/checkout.flow.js";
import { SaucedemoKeys } from "../src/states/checkout.mem-keys.js";

// checkoutFlow.withBlockVerify/modBlockVerify - a spec that only imports the
// finished flow, not necessarily the individual Blocks, patching one Block's
// verify for just this test, against the real live site. No edit to
// checkout.flow.ts or block sources, and checkout-flow.spec.ts's own run of
// the unpatched checkoutFlow (proven passing there) is untouched by any of this.

test("modBlockVerify: patching finish-order's check to one that fails makes the real live run fail loud, naming the Block - not just a synthetic in-memory Block", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });
  mem.set(SaucedemoKeys.selectedItem, { id: "sauce-labs-backpack", name: "Sauce Labs Backpack" });

  // Full checkout still runs for real against saucedemo.com - only the final
  // verify check is a synthetic "always false", so the failure proves the
  // patch took effect on a live run without a long waitForURL timeout.
  const patched = checkoutFlow.modBlockVerify("finish-order", 0, {
    name: "intentionally-impossible",
    check: async () => false,
  });

  await expect(patched.run(mem)).rejects.toThrow(/finish-order/);
});

test("withBlockVerify: replacing login's verify with an extra real check still passes against the live site", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });
  mem.set(SaucedemoKeys.selectedItem, { id: "sauce-labs-backpack", name: "Sauce Labs Backpack" });

  // checkoutFlow's login steps are one inline `{ ff: true }` group, auto-named "ff-1".
  const patched = checkoutFlow.withBlockVerify("ff-1", [
    Trait.url({ pathname: "/inventory.html" }),
    Trait.visible(".inventory_list"),
  ]);

  const result = await patched.run(mem);
  expect(result).toEqual(checkpoint("OrderComplete"));
});
