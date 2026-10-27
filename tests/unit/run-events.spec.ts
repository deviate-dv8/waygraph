import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inRun, onRunEvent, stepEnded, stepStarted, type RunEvent } from "../../src/engine/run/events.js";

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
});
