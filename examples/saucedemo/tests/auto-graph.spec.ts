import { test, expect } from "@playwright/test";
import { discoverGraph } from "waygraph";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

test("waygraph auto discovers the decomposed saucedemo graph with zero skipped Blocks", async () => {
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
  // +2 vs pre-remove: remove-from-cart branches * → ItemInCart | LoggedIn
  expect(graph.edges.length).toBe(15);
  const removeEdges = graph.edges.filter((e) => e.block === "remove-from-cart");
  expect(removeEdges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: "*", to: "ItemInCart", kind: "action" }),
      expect.objectContaining({ from: "*", to: "LoggedIn", kind: "action" }),
    ]),
  );

  const loginFail = graph.edges.find((e) => e.block === "submit-login" && e.to === "LoginPage");
  expect(loginFail).toMatchObject({ from: "LoginPage", to: "LoginPage", kind: "action" });
  expect(graph.skipped.length).toBe(0);

  const logout = graph.edges.find((e) => e.block === "submit-logout");
  expect(logout).toMatchObject({ from: "LoggedIn", to: "LoginPage", kind: "action" });
});
