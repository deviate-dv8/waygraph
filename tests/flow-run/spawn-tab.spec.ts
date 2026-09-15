import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/types.js";
import { connect, checkpoint } from "../../src/types.js";
import { runGraph, spawnTab } from "../../src/engine.js";
import { MemPage } from "../../src/mem-page.js";

const MAIN_URL = `data:text/html,${encodeURIComponent("<h1>Main</h1>")}`;
const SUB_URL = `data:text/html,${encodeURIComponent("<h1>Sub</h1>")}`;

type Start = Checkpoint<"__start__">;
type MainLoaded = Checkpoint<"MainLoaded">;
type SubDone = Checkpoint<"SubDone">;
type BothDone = Checkpoint<"BothDone">;

const GotoMain: Block<Start, MainLoaded> = {
  name: "goto-main",
  instruction: {
    async act(page) {
      await page.goto(MAIN_URL);
    },
    resolve: () => checkpoint("MainLoaded"),
  },
};

const GotoSub: Block<Start, SubDone> = {
  name: "goto-sub",
  instruction: {
    async act(subPage) {
      await subPage.goto(SUB_URL);
    },
    async observe(subPage) {
      // The real proof: while this sub-tab is mid-flight, exactly one other
      // page exists in the same context, still on MAIN_URL - a genuinely
      // separate, still-alive tab, not the same page reused for both.
      const otherPages = subPage.context().pages().filter((p) => p !== subPage);
      expect(otherPages).toHaveLength(1);
      expect(otherPages[0]!.url()).toBe(MAIN_URL);
    },
    resolve: () => checkpoint("SubDone"),
  },
};

const SpawnSub: Block<MainLoaded, BothDone> = {
  name: "spawn-sub",
  instruction: {
    async act() {},
    async observe(page, mem) {
      const subResult = await spawnTab(GotoSub, page, mem);
      // The spawned tab closes itself (its own runGraph's finally) before
      // spawnTab resolves - checked right here, before the outer runGraph
      // reaches its own finally and closes this page too, which is the only
      // moment "just the sub tab is gone, this page is still alive" is true.
      expect(page.context().pages()).toEqual([page]);
      return subResult;
    },
    resolve: (subResult) => {
      expect(subResult).toEqual(checkpoint("SubDone"));
      return checkpoint("BothDone");
    },
  },
};

test("spawnTab drives a genuinely separate second tab, then closes it, leaving the original untouched", async ({
  context,
}) => {
  const chain = connect(GotoMain, SpawnSub);
  const result = await runGraph<BothDone>(chain, new Set(["BothDone"]), context, new MemPage());

  expect(result).toEqual(checkpoint("BothDone"));
});
