import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findStatePages } from "../../src/analysis/state-pages.js";
import type { Manifest } from "../../src/manifest/manifest.js";

const block = (name: string, kind: string, from: string[], to: string[]) => ({ name, kind, from, to }) as Manifest["blocks"][number];

describe("findStatePages", () => {
  const manifest = {
    checkpoints: ["__start__", "Login", "LinkSent", "LinkInvalid", "Inventory", "ItemInCart", "OrderComplete"],
    pageUrls: {
      Login: ["/auth/login"],
      LinkInvalid: ["http://app.test/auth/login?error=INVALID_TOKEN"],
      Inventory: ["/inventory.html"],
      OrderComplete: ["/checkout-complete.html"],
    },
    blocks: [
      block("nav-login", "nav", ["*"], ["Login"]),
      block("submit-magic-link", "method", ["Login"], ["LinkSent"]),
      block("nav-used-link", "nav", ["*"], ["LinkInvalid"]),
      block("nav-inventory", "nav", ["*"], ["Inventory"]),
      block("add-to-cart", "method", ["Inventory"], ["ItemInCart"]),
      block("finish-order", "method", ["Inventory"], ["OrderComplete"]),
      block("expect-sent", "expect", ["LinkSent"], ["LinkSent"]),
    ],
  } as unknown as Manifest;

  it("finds a Checkpoint only Methods land on, with no address, and one with another page's address", () => {
    assert.deepEqual(findStatePages(manifest), [
      { checkpoint: "LinkSent", reachedBy: ["submit-magic-link"] },
      { checkpoint: "LinkInvalid", sharesWith: { page: "Login", address: "/auth/login" } },
      { checkpoint: "ItemInCart", reachedBy: ["add-to-cart"] },
    ]);
  });

  it("a page with an address of its own is a page, though nothing starts from it; one a step starts from is too", () => {
    const names = findStatePages(manifest).map((s) => s.checkpoint);
    assert.ok(!names.includes("OrderComplete"));
    assert.ok(!names.includes("Login"));
    const withAStep = { ...manifest, blocks: [...manifest.blocks, block("remove-from-cart", "method", ["ItemInCart"], ["Inventory"])] } as Manifest;
    assert.ok(!findStatePages(withAStep).some((s) => s.checkpoint === "ItemInCart"));
  });
});
