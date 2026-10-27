import { test, expect } from "@playwright/test";
import { checkpoint, defineMethodBlock, Engine, MemPage, onRunEvent, type RunEvent } from "../../src/index.js";
import { playSteps } from "../../src/runner/play-steps.js";
import type { PlayStep } from "../../src/runner/mode.js";

const Start = checkpoint("__start__");
const Created = checkpoint("Created");
const log: string[] = [];
const create = defineMethodBlock({ name: "create-user", from: Start, to: Created, instruction: { async act() { log.push("create"); } } });
const broken = defineMethodBlock({ name: "check-user", from: Created, to: Created, instruction: { async act() { log.push("check"); throw new Error("profile missing"); } } });
const cleanup = defineMethodBlock({ name: "delete-user", to: checkpoint("Deleted"), instruction: { async act() { log.push("delete"); } } });
const failingCleanup = defineMethodBlock({ name: "delete-orders", to: checkpoint("Deleted"), instruction: { async act() { log.push("delete-orders"); throw new Error("api down"); } } });
const engine = new Engine();

test.beforeEach(() => {
  log.length = 0;
});

test("cleanup runs after the steps pass, and the flow lands where its steps did", async ({ page }) => {
  const flow = engine.map().method(create).finally(cleanup).end();
  expect(await flow.run(page.context(), new MemPage(), { page })).toEqual(Created);
  expect(log).toEqual(["create", "delete"]);
  expect(flow.blocks().map((b) => [b.name, b.cleanup ?? false])).toEqual([["create-user", false], ["delete-user", true]]);
});

test("cleanup runs after a step fails, and the step's error is the flow's", async ({ page }) => {
  const flow = engine.map().method(create).method(broken).finally(cleanup).end();
  await expect(flow.run(page.context(), new MemPage(), { page })).rejects.toThrow("profile missing");
  expect(log).toEqual(["create", "check", "delete"]);
});

test("a failing cleanup step is reported, the rest still run, and the flow still passes", async ({ page }) => {
  const events: RunEvent[] = [];
  const off = onRunEvent((e) => events.push(e));
  const flow = engine.map().method(create).finally(failingCleanup).finally(cleanup).end();
  expect(await flow.run(page.context(), new MemPage(), { page })).toEqual(Created);
  off();
  expect(log).toEqual(["create", "delete-orders", "delete"]);
  const starts = events.filter((e) => e.type === "step:start") as Extract<RunEvent, { type: "step:start" }>[];
  expect(starts.map((e) => [e.block, e.cleanup ?? false])).toEqual([["create-user", false], ["delete-orders", true], ["delete-user", true]]);
  expect(events.some((e) => e.type === "step:error" && e.block === "delete-orders")).toBe(true);
});

test("a nested flow's cleanup runs at the end of the outer flow", async ({ page }) => {
  const inner = engine.map().method(create).finally(cleanup).end();
  const outer = engine.map().flow(inner).method(defineMethodBlock({ name: "use-user", from: Created, to: Created, instruction: { async act() { log.push("use"); } } })).end();
  await outer.run(page.context(), new MemPage(), { page });
  expect(log).toEqual(["create", "use", "delete"]);
});

test("the runner plays a flow's cleanup when one of its steps fails, and the run still fails", async ({ page }) => {
  const flow = engine.map().method(create).method(broken).finally(cleanup).end();
  const steps: PlayStep[] = flow.blocks().map((info) => ({
    block: info.block,
    exportName: info.name,
    config: flow.config,
    resetSession: false,
    segment: 0,
    ...(info.cleanup ? { cleanup: true } : {}),
  }));
  const outcome = await playSteps(steps, { context: page.context(), page: page as never, mem: new MemPage(), baseURL: undefined }, { name: "run" }, false);
  expect(outcome.ok).toBe(false);
  expect(outcome.failedAt?.step.block.name).toBe("check-user");
  expect(log).toEqual(["create", "check", "delete"]);
});
