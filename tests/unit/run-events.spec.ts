import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inRun, onRunEvent, stepEnded, stepFailed, stepStarted, type RunEvent } from "../../src/engine/run/events.js";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("run events: one run per async call chain", () => {
  it("two runs at once keep their own id and step counter", async () => {
    const events: RunEvent[] = [];
    const off = onRunEvent((e) => events.push(e));
    const worker = (name: string) =>
      inRun(name, async () => {
        for (const block of ["a", "b"]) {
          stepStarted(`${name}-${block}`, "method", "Start");
          await tick();
          stepEnded(`${name}-${block}`, "End");
        }
        return name;
      }, (r) => r);
    await Promise.all([worker("w1"), worker("w2")]);
    off();
    const runIds = new Set(events.map((e) => e.runId));
    assert.equal(runIds.size, 2);
    for (const runId of runIds) {
      const mine = events.filter((e) => e.runId === runId);
      const starts = mine.filter((e) => e.type === "step:start") as Extract<RunEvent, { type: "step:start" }>[];
      const ends = mine.filter((e) => e.type === "step:end") as Extract<RunEvent, { type: "step:end" }>[];
      const label = (mine.find((e) => e.type === "run:start") as Extract<RunEvent, { type: "run:start" }>).label!;
      assert.deepEqual(starts.map((e) => [e.index, e.block]), [[0, `${label}-a`], [1, `${label}-b`]]);
      assert.deepEqual(ends.map((e) => e.block), [`${label}-a`, `${label}-b`]);
      assert.deepEqual(mine.at(-1), { ...mine.at(-1), type: "run:end", ok: true, result: label });
    }
  });

  it("a run inside a run joins it, and a failure ends the run with the error", async () => {
    const events: RunEvent[] = [];
    const off = onRunEvent((e) => events.push(e));
    await assert.rejects(
      inRun("outer", async () => {
        await inRun("inner", async () => stepStarted("x", "method", "Start"));
        throw new Error("boom");
      }),
    );
    off();
    assert.equal(new Set(events.map((e) => e.runId)).size, 1);
    assert.equal(events.filter((e) => e.type === "run:start").length, 1);
    assert.deepEqual(events.at(-1), { ...events.at(-1), type: "run:end", ok: false, error: "boom" });
  });

  it("a fast-forward step holds its inner steps: each ends once, the last with the fast-forward step", async () => {
    const events: RunEvent[] = [];
    const off = onRunEvent((e) => events.push(e));
    await inRun("ff", async () => {
      stepStarted("ff-1", "block", "__start__");
      stepStarted("nav-login", "nav", "__start__");
      stepEnded("nav-login", "LoginPage");
      stepStarted("submit-login", "method", "LoginPage");
      stepEnded("ff-1", "LoggedIn");
      stepStarted("add-to-cart", "method", "LoggedIn");
      stepFailed(new Error("no button"));
    });
    off();
    const steps = events.filter((e) => e.type.startsWith("step:")).map((e) => [e.type, (e as { index: number }).index, (e as { block: string }).block, (e as { parent?: number }).parent ?? (e as { to?: string }).to]);
    assert.deepEqual(steps, [
      ["step:start", 0, "ff-1", undefined],
      ["step:start", 1, "nav-login", 0],
      ["step:end", 1, "nav-login", "LoginPage"],
      ["step:start", 2, "submit-login", 0],
      ["step:end", 2, "submit-login", "LoggedIn"],
      ["step:end", 0, "ff-1", "LoggedIn"],
      ["step:start", 3, "add-to-cart", undefined],
      ["step:error", 3, "add-to-cart", undefined],
    ]);
  });
});
