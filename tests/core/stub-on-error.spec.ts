import { test, expect } from "@playwright/test";
import {
  resolveHighlightSlots,
  hasAuthoredStubOnError,
  hasAuthoredStubAfter,
} from "../../src/index.js";
import type { Block } from "../../src/index.js";

function fakeBlock(instruction: Record<string, unknown>): Block<any, any> {
  return {
    name: "submit-login",
    instruction: {
      act: async () => {},
      resolve: () => ({ __state: "LoginPage" }),
      ...instruction,
    },
  } as unknown as Block<any, any>;
}

test.describe("stubOnError", () => {
  test("resolves block stubOnError slots", () => {
    const block = fakeBlock({
      stubOnError: {
        error: { selector: '[data-test="error"]', label: "Login error banner" },
      },
    });
    const slots = resolveHighlightSlots(block, "stubOnError");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.selector).toBe('[data-test="error"]');
    expect(slots[0]!.label).toBe("Login error banner");
    expect(hasAuthoredStubOnError(block)).toBe(true);
  });

  test("success stubAfter is independent of stubOnError", () => {
    const block = fakeBlock({
      stubAfter: {
        ok: { selector: ".inventory_list", label: "Inventory" },
      },
      stubOnError: {
        error: { selector: '[data-test="error"]', label: "Error" },
      },
    });
    expect(hasAuthoredStubAfter(block, { __state: "LoggedIn" })).toBe(true);
    expect(resolveHighlightSlots(block, "stubAfter")).toHaveLength(1);
    expect(resolveHighlightSlots(block, "stubOnError")).toHaveLength(1);
    expect(resolveHighlightSlots(block, "stubAfter")[0]!.label).toBe("Inventory");
    expect(resolveHighlightSlots(block, "stubOnError")[0]!.label).toBe("Error");
  });

  test("empty stubOnError + no fixtures -> hasAuthoredStubOnError false", () => {
    const block = fakeBlock({ stubOnError: {} });
    expect(hasAuthoredStubOnError(block)).toBe(false);
    expect(resolveHighlightSlots(block, "stubOnError")).toHaveLength(0);
  });
});
