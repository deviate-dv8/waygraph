import { test, expect } from "@playwright/test";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { findOrphanBlocks, findBlockPath } from "../../src/analysis/graph.js";
import type { WaygraphGraph } from "../../src/analysis/graph.js";

const BLOCK_A = `
import { defineMethodBlock, checkpoint } from "waygraph";
export const BlockA = defineMethodBlock({
  name: "block-a",
  from: checkpoint("A"),
  to: checkpoint("B"),
  instruction: { async act() {}, resolve: () => checkpoint("B") },
});
`;

const BLOCK_ORPHAN = `
import { defineMethodBlock, checkpoint } from "waygraph";
export const OrphanBlock = defineMethodBlock({
  name: "orphan",
  from: checkpoint("X"),
  to: checkpoint("Y"),
  instruction: { async act() {}, resolve: () => checkpoint("Y") },
});
`;

const FLOW = `
import { Engine } from "waygraph";
import { BlockA } from "../blocks/a.block.js";
const engine = new Engine();
export const demoFlow = engine.map().start().method(BlockA).end();
`;

test("findOrphanBlocks reports Blocks no flow plays", async () => {
  const tmpDir = join(import.meta.dirname, ".tmp-orphans");
  await mkdir(join(tmpDir, "src/blocks"), { recursive: true });
  await mkdir(join(tmpDir, "src/flows"), { recursive: true });
  await writeFile(join(tmpDir, "src/blocks/a.block.ts"), BLOCK_A);
  await writeFile(join(tmpDir, "src/blocks/orphan.block.ts"), BLOCK_ORPHAN);
  await writeFile(join(tmpDir, "src/flows/demo.flow.ts"), FLOW);
  try {
    const orphans = await findOrphanBlocks(tmpDir);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.exportName).toBe("OrphanBlock");
    expect(orphans[0]?.block).toBe("orphan");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("a Block played only inside a fast-forward step is not an orphan", async () => {
  const tmpDir = join(import.meta.dirname, ".tmp-orphans-ff");
  const block = (name: string, exportName: string, from: string, to: string) => `
import { defineMethodBlock, checkpoint } from "waygraph";
export const ${exportName} = defineMethodBlock({ name: "${name}", from: checkpoint("${from}"), to: checkpoint("${to}"), instruction: { async act() {} } });
`;
  await mkdir(join(tmpDir, "src/blocks"), { recursive: true });
  await mkdir(join(tmpDir, "src/flows"), { recursive: true });
  await writeFile(join(tmpDir, "src/blocks/a.block.ts"), block("block-a", "BlockA", "A", "B"));
  await writeFile(join(tmpDir, "src/blocks/b.block.ts"), block("block-b", "BlockB", "B", "C"));
  await writeFile(join(tmpDir, "src/blocks/c.block.ts"), block("block-c", "BlockC", "C", "D"));
  await writeFile(join(tmpDir, "src/blocks/orphan.block.ts"), BLOCK_ORPHAN);
  await writeFile(join(tmpDir, "src/flows/ff.flow.ts"), `
import { Engine } from "waygraph";
import { BlockA } from "../blocks/a.block.js";
import { BlockB } from "../blocks/b.block.js";
import { BlockC } from "../blocks/c.block.js";
export const ffFlow = new Engine().map().start().method(BlockA).method(BlockB, { ff: true }).method(BlockC, { ff: true }).end();
`);
  try {
    const orphans = await findOrphanBlocks(tmpDir);
    expect(orphans.map((o) => o.block)).toEqual(["orphan"]);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("findBlockPath walks discovered edges including nav from *", () => {
  const graph: WaygraphGraph = {
    nodes: [{ checkpoint: "LoggedIn" }, { checkpoint: "Cart" }, { checkpoint: "Done" }],
    edges: [
      { block: "nav-cart", file: "x", from: "*", to: "Cart", kind: "nav" },
      { block: "checkout", file: "y", from: "Cart", to: "Done", kind: "action" },
    ],
    skipped: [],
  };
  expect(findBlockPath(graph, "LoggedIn", "Done")).toEqual(["nav-cart", "checkout"]);
});
