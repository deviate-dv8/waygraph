import { test, expect } from "@playwright/test";
import { Engine, MemPage, Start, checkpoint, defineNavBlock } from "../../src/index.js";
import { flowLabels } from "../../src/manifest/labels.js";
import { inRun, onRunEvent } from "../../src/engine/run/events.js";

const Home = checkpoint("MetaHome");
const NavHome = defineNavBlock({ name: "meta-nav", checkpoint: Home, url: "about:blank" });

test("a flow carries what it says about itself, and its own labels join the config's", () => {
  const flow = new Engine().map({ title: "Open the home page", description: "A visitor lands on home.", labels: ["smoke", "home"], ticket: "QA-1", owner: "web" }).gotoPage(NavHome);
  expect(flow.meta).toEqual({ title: "Open the home page", description: "A visitor lands on home.", labels: ["smoke", "home"], ticket: "QA-1", owner: "web" });
  // A flow with none says nothing; the config's globs add to a flow's own labels, once each.
  expect(new Engine().map().gotoPage(NavHome).meta).toBeUndefined();
  expect(flowLabels(["smoke"], { smoke: ["src/flows/**"], auth: ["src/flows/a.flow.ts"] }, "src/flows/a.flow.ts", "aFlow")).toEqual(["smoke", "auth"]);
  void Start;
});

test("the run log says it with the flow's data", async () => {
  const events: { type: string; meta?: unknown }[] = [];
  const off = onRunEvent((e) => events.push(e as never));
  try {
    const { recordMem } = await import("../../src/engine/run/events.js");
    await inRun("x", async () => recordMem(0, "homeFlow", {}, { title: "T", labels: ["a"] }));
  } finally {
    off();
  }
  expect(events.find((e) => e.type === "run:mem")?.meta).toEqual({ title: "T", labels: ["a"] });
  void MemPage;
});
