import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTodos, resolveHighlightSlots, runStubPhase } from "../../src/highlights.js";
import type { Block } from "../../src/types.js";
import type { StubCtx } from "../../src/highlights.js";

describe("normalizeTodos", () => {
  it("applies todoIndex for sequential done/current", () => {
    const rows = normalizeTodos(["A", "B", "C"], 1);
    assert.deepEqual(rows, [
      { text: "A", done: true, current: false },
      { text: "B", done: false, current: true },
      { text: "C", done: false, current: false },
    ]);
  });

  it("keeps explicit done/current over todoIndex", () => {
    const rows = normalizeTodos(
      [
        { text: "A", done: false },
        { text: "B", current: true },
        "C",
      ],
      2,
    );
    assert.deepEqual(rows[0], { text: "A", done: false, current: false });
    assert.deepEqual(rows[1], { text: "B", done: true, current: true });
    assert.deepEqual(rows[2], { text: "C", done: false, current: true });
  });
});

describe("normalizeTodoPos + ctx.todoPos / ctx.title", () => {
  it("normalizes left/right aliases", async () => {
    const { normalizeTodoPos } = await import("../../src/highlights.js");
    assert.equal(normalizeTodoPos("left"), "left");
    assert.equal(normalizeTodoPos("RIGHT"), "right");
    assert.equal(normalizeTodoPos("r"), "right");
    assert.equal(normalizeTodoPos("nope"), undefined);
  });

  it("normalizes bullets style aliases", async () => {
    const { normalizeTodoStyle } = await import("../../src/highlights.js");
    assert.equal(normalizeTodoStyle("bullets"), "bullets");
    assert.equal(normalizeTodoStyle("bullet"), "bullets");
    assert.equal(normalizeTodoStyle("list"), "bullets");
    assert.equal(normalizeTodoStyle("plain"), "bullets");
    assert.equal(normalizeTodoStyle("checklist"), "checklist");
  });

  it("bullets style ignores todoIndex current marks", () => {
    const rows = normalizeTodos(["A", "B", "C"], 1, "bullets");
    assert.equal(rows.every((r) => !r.current), true);
    assert.deepEqual(rows.map((r) => r.text), ["A", "B", "C"]);
  });

  it("exposes title + todoPos from stubBefore lifecycle", async () => {
    const { normalizeTodoPos } = await import("../../src/highlights.js");
    assert.equal(normalizeTodoPos("left"), "left");
    const block = {
      name: "submit-login",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.title("Signing in");
          ctx.todoPos("right");
          ctx.todoStyle("bullets");
          ctx.todos(["Email", "Password"]);
          ctx.todoIndex(0);
        },
      },
    } as unknown as Block<any, any>;

    const phase = await runStubPhase(block, "stubBefore");
    assert.equal(phase.title, "Signing in");
    assert.equal(phase.todoPos, "right");
    assert.equal(phase.todoDock?.style, "bullets");
    assert.equal(phase.todos.every((t) => !t.current), true);
  });
});

describe("open stubBefore(ctx) lifecycle", () => {
  it("sets todos + rings via ctx (not slot object)", async () => {
    const block = {
      name: "submit-login",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.todos(["Email", "Password", "Submit"]);
          ctx.todoIndex(1);
          ctx.zoom(1.35);
          ctx.highlights({
            plan: { selector: "#login-button", label: "Plan" },
          });
        },
      },
    } as unknown as Block<any, any>;

    const phase = await runStubPhase(block, "stubBefore");
    assert.deepEqual(phase.todos, [
      { text: "Email", done: true, current: false },
      { text: "Password", done: false, current: true },
      { text: "Submit", done: false, current: false },
    ]);
    assert.equal(phase.todoIndex, 1);
    assert.equal(phase.zoom, 1.35);
    assert.equal(phase.highlights.length, 1);
    assert.equal(phase.highlights[0]!.selector, "#login-button");
    assert.equal(phase.highlights[0]!.zoom, 1.35); // default zoom applied
  });

  it("bumps todoIndex sequentially across phases", async () => {
    const todos = ["Email", "Password", "Submit"] as const;
    const block = {
      name: "submit-login",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.todos([...todos]);
          ctx.todoIndex(0);
          ctx.ring("email", { selector: "#email", label: "Email" });
        },
        stubAfter: (ctx: StubCtx) => {
          ctx.todos([...todos]);
          ctx.todoIndex(2);
          ctx.ring("inv", { selector: ".inventory", label: "Inventory" });
        },
      },
    } as unknown as Block<any, any>;

    const before = await runStubPhase(block, "stubBefore");
    assert.equal(before.todoIndex, 0);
    assert.equal(before.todos[0]!.current, true);

    const after = await runStubPhase(block, "stubAfter", {
      out: { __state: "Inventory" },
    });
    assert.equal(after.todoIndex, 2);
    assert.equal(after.todos[2]!.current, true);
    assert.equal(after.highlights[0]!.selector, ".inventory");
  });

  it("object map shorthand still resolves rings", () => {
    const block = {
      name: "submit-login",
      instruction: {
        stubBefore: {
          plan: { selector: "#login-button", label: "Plan", zoom: 1.4 },
        },
      },
    } as unknown as Block<any, any>;
    const slots = resolveHighlightSlots(block, "stubBefore", {
      fixtures: {
        "submit-login": {
          stubBefore: {
            plan: { label: "AC checklist", zoom: 1.5 },
          },
        },
      },
    });
    assert.equal(slots.length, 1);
    assert.equal(slots[0]!.zoom, 1.5);
    assert.equal(slots[0]!.label, "AC checklist");
    assert.equal(slots[0]!.selector, "#login-button");
  });

  it("lifts legacy per-slot todos onto phase (0.12.23 compat)", async () => {
    const block = {
      name: "submit-login",
      instruction: {
        stubBefore: {
          plan: {
            selector: "#login-button",
            label: "Plan",
            todos: ["Email", "Password", "Submit"],
            todoIndex: 0,
          },
        },
      },
    } as unknown as Block<any, any>;
    const phase = await runStubPhase(block, "stubBefore");
    assert.equal(phase.todos.length, 3);
    assert.equal(phase.todos[0]!.current, true);
  });
});

describe("todo persist + external ids (PIA #10 / Mailhog-style)", () => {
  it("omitting todos on a later phase returns todoSync keep (does not clear)", async () => {
    const withTodos = {
      name: "teach",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.todoId("ep10-coverage");
          ctx.todos([
            { id: "fr-1", text: "FR: manpower read" },
            { name: "sc-2", text: "Scenario: open dock" },
          ]);
          ctx.todoIndex(0);
        },
      },
    } as unknown as Block<any, any>;
    const bare = {
      name: "next-block",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.ring("x", { selector: "#x", label: "X" });
        },
      },
    } as unknown as Block<any, any>;

    const setPhase = await runStubPhase(withTodos, "stubBefore");
    assert.equal(setPhase.todoSync, "set");
    assert.equal(setPhase.todoDock?.id, "ep10-coverage");
    assert.equal(setPhase.todos[0]!.id, "fr-1");
    assert.equal(setPhase.todos[1]!.id, "sc-2");

    const keepPhase = await runStubPhase(bare, "stubBefore");
    assert.equal(keepPhase.todoSync, "keep");
    assert.equal(keepPhase.todoDock, undefined);
    assert.deepEqual(keepPhase.todos, []);
  });

  it("hideTodos / todos([]) returns todoSync clear", async () => {
    const hide = {
      name: "hide",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.hideTodos();
        },
      },
    } as unknown as Block<any, any>;
    const empty = {
      name: "empty",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.todos([]);
        },
      },
    } as unknown as Block<any, any>;
    assert.equal((await runStubPhase(hide, "stubBefore")).todoSync, "clear");
    assert.equal((await runStubPhase(empty, "stubBefore")).todoSync, "clear");
  });

  it("applyTodoPhase keeps previous dock when sync is keep", async () => {
    const { applyTodoPhase, buildTodoDock } = await import("../../src/highlights.js");
    const prev = buildTodoDock({
      todoId: "ep10-coverage",
      todos: [
        { id: "mailhog-back", text: "Return from Mailhog" },
        { id: "assert-dock", text: "Assert dock still present" },
      ],
      todoIndex: 0,
    });
    assert.equal(prev?.id, "ep10-coverage");
    const kept = applyTodoPhase(prev, { todoSync: "keep" });
    assert.equal(kept.sync, "keep");
    assert.equal(kept.dock, prev);
    assert.equal(kept.dock?.groups[0]?.items[0]?.id, "mailhog-back");

    const cleared = applyTodoPhase(prev, { todoSync: "clear" });
    assert.equal(cleared.sync, "clear");
    assert.equal(cleared.dock, undefined);
  });

  it("applyTodoPhase keep preserves advanced current after mid-act style set", async () => {
    const { applyTodoPhase, buildTodoDock, advanceTodoDock } = await import("../../src/highlights.js");
    const base = buildTodoDock({
      todoId: "ep10",
      todos: ["A", "B", "C"],
      todoIndex: 0,
    });
    const midAct = advanceTodoDock(base, 2);
    assert.equal(midAct?.groups[0]?.items[2]?.current, true);
    const kept = applyTodoPhase(midAct, { todoSync: "keep" });
    assert.equal(kept.dock?.groups[0]?.items[2]?.current, true);
    // A later stubBefore that re-sets index 0 would wipe - that is authoring,
    // not keep. keep must not invent a blank dock.
    const wiped = applyTodoPhase(midAct, {
      todoSync: "set",
      todoDock: buildTodoDock({ todoId: "ep10", todos: ["A", "B", "C"], todoIndex: 0 }),
    });
    assert.equal(wiped.dock?.groups[0]?.items[0]?.current, true);
  });
});
