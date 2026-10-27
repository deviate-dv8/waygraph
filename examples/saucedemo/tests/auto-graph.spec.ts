import { test, expect } from "@playwright/test";
import { discoverGraph } from "waygraph";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

test("waygraph auto discovers the decomposed saucedemo graph, with no Block skipped", async () => {
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
  // 25 vs the earlier 15: checkout-info split into fill-first-name/
  // fill-last-name/fill-postal-code (+2 net), the atomic login Blocks
  // (fill-username/fill-password/submit-login's 2 branches), and nav-inventory
  // (straight to the catalogue for a flow that starts signed in).
  expect(graph.edges.length).toBe(25);
  const removeEdges = graph.edges.filter((e) => e.block === "remove-from-cart");
  expect(removeEdges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: "*", to: "ItemInCart", kind: "action" }),
      expect.objectContaining({ from: "*", to: "LoggedIn", kind: "action" }),
    ]),
  );

  const loginFail = graph.edges.find((e) => e.block === "submit-login" && e.to === "LoginPage");
  expect(loginFail).toMatchObject({ from: "LoginPage", to: "LoginPage", kind: "action" });

  // Every Block has a route, so nothing is skipped.
  expect(graph.skipped).toEqual([]);

  const logout = graph.edges.find((e) => e.block === "submit-logout");
  expect(logout).toMatchObject({ from: "LoggedIn", to: "LoginPage", kind: "action" });
});
