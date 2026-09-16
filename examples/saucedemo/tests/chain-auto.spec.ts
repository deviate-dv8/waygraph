import { test, expect } from "@playwright/test";
import { discoverGraph, findBlockPath, findOrphanBlocks } from "waygraph";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

test("zero orphan Blocks so chain auto shorthand is allowed", async () => {
  const orphans = await findOrphanBlocks(projectDir);
  expect(orphans).toEqual([]);
});

test("chain auto graph plans LoginPage to OrderComplete (shortest edge walk)", async () => {
  const graph = await discoverGraph(projectDir);
  const path = findBlockPath(graph, "LoginPage", "OrderComplete");
  // NavBlocks contribute from: "*" edges, so the planner may skip login when a
  // checkout nav exists - that is graph shorthand, not a runtime guarantee.
  expect(path).not.toBeNull();
  expect(path?.length).toBeGreaterThan(0);
  expect(path).toContain("finish-order");
  expect(path).toContain("submit-checkout-info");
});

test("chain auto graph plans LoggedIn to LoginPage through logout", async () => {
  const graph = await discoverGraph(projectDir);
  const path = findBlockPath(graph, "LoggedIn", "LoginPage");
  expect(path).toEqual(["submit-logout"]);
});
