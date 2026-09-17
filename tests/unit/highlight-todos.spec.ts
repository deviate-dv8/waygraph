import { describe, expect, it } from "vitest";
import { normalizeTodos, resolveHighlightSlots } from "../../src/highlights.js";
import type { Block } from "../../src/types.js";

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

describe("stub todos/zoom merge via resolveHighlightSlots", () => {
  it("merges fixture todos and zoom onto stubBefore", () => {
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
    const slots = resolveHighlightSlots(block, "stubBefore", {
      fixtures: {
        "submit-login": {
          stubBefore: {
            plan: {
              label: "AC checklist",
              todoIndex: 1,
              zoom: 1.4,
            },
          },
        },
      },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.todoIndex).toBe(1);
    expect(slots[0]!.zoom).toBe(1.4);
    expect(slots[0]!.todos).toEqual(["Email", "Password", "Submit"]);
    expect(slots[0]!.selector).toBe("#login-button");
  });
});
