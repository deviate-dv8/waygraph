import { test, expect } from "@playwright/test";
import { discoverGraph } from "waygraph";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

test("waygraph auto discovers the decomposed saucedemo graph, skipping only the FFCompose auth step", async () => {
  const graph = await discoverGraph(projectDir);

  expect(graph.nodes.map((n) => n.checkpoint).sort()).toEqual(
    [
      "CartPage",
      "CheckoutInfoPage",
      "CheckoutOverviewPage",
      "ItemDetailPage",
      "ItemInCart",
      "LoggedIn",
      "LoginPage",
      "OrderComplete",
    ].sort(),
  );
  // 24 vs the earlier 15: checkout-info split into fill-first-name/
  // fill-last-name/fill-postal-code (+2 net) plus the atomic login Blocks
  // (fill-username/fill-password/submit-login's 2 branches) that static
  // discovery still sees even though checkoutFlow itself now drives them
  // through the ff-owner-auth composition below.
  expect(graph.edges.length).toBe(24);
  const removeEdges = graph.edges.filter((e) => e.block === "remove-from-cart");
  expect(removeEdges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: "*", to: "ItemInCart", kind: "action" }),
      expect.objectContaining({ from: "*", to: "LoggedIn", kind: "action" }),
    ]),
  );

  const loginFail = graph.edges.find((e) => e.block === "submit-login" && e.to === "LoginPage");
  expect(loginFail).toMatchObject({ from: "LoginPage", to: "LoginPage", kind: "action" });

  // ff-owner-auth (fastForwardComposeBlock) collapses nav-login + fill-username
  // + fill-password + submit-login into one opaque demo/run step - discoverGraph
  // only understands plain defineMethodBlock/defineEffectBlock<In, Out> generic
  // calls, so this one Block is expected to be skipped by static discovery even
  // though it's a real, used step (see src/blocks/saucedemo-web/ff-owner-auth.block.ts).
  expect(graph.skipped).toEqual([
    expect.objectContaining({ block: "ff-owner-auth" }),
  ]);

  const logout = graph.edges.find((e) => e.block === "submit-logout");
  expect(logout).toMatchObject({ from: "LoggedIn", to: "LoginPage", kind: "action" });
});
