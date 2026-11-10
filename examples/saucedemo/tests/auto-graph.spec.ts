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
      "InventoryPage",
      "LoginPage",
      "OrderComplete",
    ].sort(),
  );
  // checkout-info split into fill-first-name/fill-last-name/fill-postal-code, the atomic login Blocks
  // (fill-username/fill-password/submit-login's 2 branches), nav-inventory (straight to the catalogue for a flow that
  // starts signed in); the cart's Methods each stay on the inventory (what's in the cart is what it shows); the menu's two
  // links, one edge from each page it covers.
  expect(graph.edges.length).toBe(33);
  const removeEdges = graph.edges.filter((e) => e.block === "remove-from-cart");
  expect(removeEdges).toEqual([expect.objectContaining({ from: "*", to: "InventoryPage", kind: "action" })]);

  const loginFail = graph.edges.find((e) => e.block === "submit-login" && e.to === "LoginPage");
  expect(loginFail).toMatchObject({ from: "LoginPage", to: "LoginPage", kind: "action" });

  // Every Block has a route, so nothing is skipped.
  expect(graph.skipped).toEqual([]);

  // Logout is the menu layout's link: from every page the menu is on.
  const logouts = graph.edges.filter((e) => e.block === "menu-logout");
  expect(logouts.map((e) => e.from).sort()).toEqual(["CartPage", "CheckoutInfoPage", "CheckoutOverviewPage", "InventoryPage", "ItemDetailPage", "OrderComplete"]);
  expect(logouts.every((e) => e.to === "LoginPage")).toBe(true);
});
