import { test, expect } from "@playwright/test";
import { MemPage, checkpoint, chainFlow } from "waygraph";
import { shopFlow } from "../src/flows/shop.flow.js";
import { viewerBlockedFlow } from "../src/flows/viewer-blocked.flow.js";
import { LoginCreds, ViewerCreds } from "../src/states/checkout.mem-keys.js";

test("chainFlow: Episode 1 shops through checkout, Episode 2 blocked login genuinely fails", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));
  mem.set(ViewerCreds({ username: "locked_out_user", password: "secret_sauce" }));

  const combined = chainFlow(shopFlow, viewerBlockedFlow);

  await expect(combined.run(mem)).rejects.toThrow(/viewer-login/);
});

test("episode 1 alone: standard_user completes checkout", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));

  const result = await shopFlow.run(mem);

  expect(result).toEqual(checkpoint("OrderComplete"));
});

test("chainFlow blocks() lists the flattened episode chain in order", () => {
  expect(shopFlow.title).toBe("Shop & Checkout");
  expect(viewerBlockedFlow.title).toBe("Viewer: Blocked Login Attempt");

  const blocks = chainFlow(shopFlow, viewerBlockedFlow).blocks();
  expect(blocks.map((b) => b.name)).toEqual([
    "nav-login",
    "submit-login",
    "add-to-cart",
    "nav-cart",
    "nav-checkout-info",
    "submit-checkout-info",
    "finish-order",
    "nav-login",
    "viewer-login",
  ]);
  expect(blocks[0]!.resetSessionBefore).toBeUndefined();
  expect(blocks[7]!.resetSessionBefore).toBe(true);
});
