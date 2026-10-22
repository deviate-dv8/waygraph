import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { discoverGraph } from "../../src/analysis/graph.js";

// The refactor must not lose or change a single Block edge. Regenerate deliberately with WAYGRAPH_UPDATE_SNAPSHOT=1.
const snapshotFile = join(import.meta.dirname, "saucedemo-graph.snapshot.json");

test("the saucedemo example's graph is unchanged", async () => {
  const graph = await discoverGraph(join(import.meta.dirname, "../../examples/saucedemo"));
  const shape = {
    nodes: graph.nodes.map((n) => n.checkpoint).sort(),
    edges: graph.edges.map((e) => `${e.kind} ${e.block}: ${e.from} -> ${e.to} (${e.file})`).sort(),
    skipped: graph.skipped.map((s) => `${s.block} (${s.file})`).sort(),
  };
  if (process.env.WAYGRAPH_UPDATE_SNAPSHOT || !existsSync(snapshotFile)) {
    writeFileSync(snapshotFile, JSON.stringify(shape, null, 2) + "\n");
  }
  expect(shape).toEqual(JSON.parse(readFileSync(snapshotFile, "utf8")));
});
