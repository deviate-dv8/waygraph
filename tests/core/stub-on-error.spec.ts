import { test, expect } from "@playwright/test";
import {
  resolveHighlightSlots,
  hasAuthoredStubOnError,
  hasAuthoredStubAfter,
  formatHighlightCaption,
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

  test("flow fixture overrides stubOnError label/tag/detail", () => {
    const block = fakeBlock({
      stubOnError: {
        error: { selector: '[data-test="error"]', label: "Login error banner" },
      },
    });
    const slots = resolveHighlightSlots(block, "stubOnError", {
      fixtures: {
        "submit-login": {
          stubOnError: {
            error: {
              label: "BUG · locked out",
              detail: "pia-style fail narration",
              tag: "FAIL",
              duration: true,
            },
          },
        },
      },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.selector).toBe('[data-test="error"]');
    expect(slots[0]!.label).toBe("BUG · locked out");
    expect(slots[0]!.tag).toBe("FAIL");
    expect(formatHighlightCaption(slots[0]!)).toBe(
      "[FAIL] BUG · locked out - pia-style fail narration",
    );
  });

  test("fixture-only stubOnError works when block has empty map", () => {
    const block = fakeBlock({ stubOnError: {} });
    const slots = resolveHighlightSlots(block, "stubOnError", {
      fixtures: {
        "submit-login": {
          stubOnError: {
            card: {
              selector: "#login-button",
              label: "Still on login",
              tag: "FAIL",
            },
          },
        },
      },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.selector).toBe("#login-button");
    expect(hasAuthoredStubOnError(block, {
      "submit-login": {
        stubOnError: {
          card: { selector: "#login-button", label: "Still on login" },
        },
      },
    })).toBe(true);
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
