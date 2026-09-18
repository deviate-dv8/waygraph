import { describe, expect, it } from "vitest";
import { normalizeTodos, resolveHighlightSlots, runStubPhase } from "../../src/highlights.js";
import type { Block } from "../../src/types.js";
import type { StubCtx } from "../../src/highlights.js";

describe("normalizeTodos", () => {
  it("applies todoIndex for sequential done/current", () => {
    const rows = normalizeTodos(["A", "B", "C"], 1);
    expect(rows).toEqual([
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
    expect(rows[0]).toEqual({ text: "A", done: false, current: false });
    expect(rows[1]).toEqual({ text: "B", done: true, current: true });
    expect(rows[2]).toEqual({ text: "C", done: false, current: true });
  });
});

describe("normalizeTodoPos + ctx.todoPos / ctx.title", () => {
  it("normalizes left/right aliases", async () => {
    const { normalizeTodoPos } = await import("../../src/highlights.js");
    expect(normalizeTodoPos("left")).toBe("left");
    expect(normalizeTodoPos("RIGHT")).toBe("right");
    expect(normalizeTodoPos("r")).toBe("right");
    expect(normalizeTodoPos("nope")).toBeUndefined();
  });

  it("exposes title + todoPos from stubBefore lifecycle", async () => {
    const block = {
      name: "submit-login",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.title("Signing in");
          ctx.todoPos("right");
          ctx.todos(["Email", "Password"]);
          ctx.todoIndex(0);
        },
      },
    } as unknown as Block<any, any>;

    const phase = await runStubPhase(block, "stubBefore");
    expect(phase.title).toBe("Signing in");
    expect(phase.todoPos).toBe("right");
    expect(phase.todos[0]!.current).toBe(true);
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
    expect(phase.todos).toEqual([
      { text: "Email", done: true, current: false },
      { text: "Password", done: false, current: true },
      { text: "Submit", done: false, current: false },
    ]);
    expect(phase.todoIndex).toBe(1);
    expect(phase.zoom).toBe(1.35);
    expect(phase.highlights).toHaveLength(1);
    expect(phase.highlights[0]!.selector).toBe("#login-button");
    expect(phase.highlights[0]!.zoom).toBe(1.35); // default zoom applied
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
    expect(before.todoIndex).toBe(0);
    expect(before.todos[0]!.current).toBe(true);

    const after = await runStubPhase(block, "stubAfter", {
      out: { __state: "Inventory" },
    });
    expect(after.todoIndex).toBe(2);
    expect(after.todos[2]!.current).toBe(true);
    expect(after.highlights[0]!.selector).toBe(".inventory");
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
    expect(slots).toHaveLength(1);
    expect(slots[0]!.zoom).toBe(1.5);
    expect(slots[0]!.label).toBe("AC checklist");
    expect(slots[0]!.selector).toBe("#login-button");
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
    expect(phase.todos).toHaveLength(3);
    expect(phase.todos[0]!.current).toBe(true);
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
    expect(setPhase.todoSync).toBe("set");
    expect(setPhase.todoDock?.id).toBe("ep10-coverage");
    expect(setPhase.todos[0]!.id).toBe("fr-1");
    expect(setPhase.todos[1]!.id).toBe("sc-2");

    const keepPhase = await runStubPhase(bare, "stubBefore");
    expect(keepPhase.todoSync).toBe("keep");
    expect(keepPhase.todoDock).toBeUndefined();
    expect(keepPhase.todos).toEqual([]);
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
    expect((await runStubPhase(hide, "stubBefore")).todoSync).toBe("clear");
    expect((await runStubPhase(empty, "stubBefore")).todoSync).toBe("clear");
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
    expect(prev?.id).toBe("ep10-coverage");
    const kept = applyTodoPhase(prev, { todoSync: "keep" });
    expect(kept.sync).toBe("keep");
    expect(kept.dock).toBe(prev);
    expect(kept.dock?.groups[0]?.items[0]?.id).toBe("mailhog-back");

    const cleared = applyTodoPhase(prev, { todoSync: "clear" });
    expect(cleared.sync).toBe("clear");
    expect(cleared.dock).toBeUndefined();
  });

  it("normalizeTodos stamps id from name alias", () => {
    const rows = normalizeTodos([{ name: "ext-redirect", text: "Click verify link" }], 0);
    expect(rows[0]!.id).toBe("ext-redirect");
  });
});
