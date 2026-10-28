import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkpoint } from "../../src/engine/checkpoint/checkpoint.js";
import { defineMethodBlock } from "../../src/engine/block/kinds/method.js";
import { fastForwardComposeBlock } from "../../src/engine/block/compose.js";
import { runStubPhase } from "../../src/demo/narration/narration.js";

const A = checkpoint("A");
const B = checkpoint("B");
const step = (name: string) => defineMethodBlock({ name, from: A, to: A, instruction: { async act() {} } });

describe("a fast-forward unit narrates its steps", () => {
  it("paints each inner step's stub, in order: the todo dock and title they set", async () => {
    const open = step("open").stubBefore((ctx) => ctx.ui.todos("adding", ["Open", "Add", "Save"], { index: 0 }));
    const add = step("add").stubBefore((ctx) => {
      ctx.ui.todos("adding", ["Open", "Add", "Save"], { index: 1 });
      ctx.ui.title("Adding a machine");
      ctx.ui.ring("add", { selector: "#add", label: "Add" });
    });
    const save = defineMethodBlock({ name: "save", from: A, to: B, instruction: { async act() {} } });
    const unit = fastForwardComposeBlock("ff-add", [open, add, save]);
    const before = await runStubPhase(unit, "stubBefore");
    assert.equal(before.title, "Adding a machine");
    assert.deepEqual(before.highlights, []); // rings are rushed past
    assert.deepEqual(before.todoDock?.groups[0]?.items.map((t) => [t.text, !!t.done, !!t.current]), [
      ["Open", true, false],
      ["Add", false, true],
      ["Save", false, false],
    ]);
  });

  it("a unit whose steps narrate nothing narrates nothing", async () => {
    const before = await runStubPhase(fastForwardComposeBlock("ff-quiet", [step("one"), step("two")]), "stubBefore");
    assert.equal(before.todoDock, undefined);
    assert.equal(before.title, undefined);
  });
});
