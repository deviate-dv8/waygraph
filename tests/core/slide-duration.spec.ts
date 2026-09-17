import { test, expect } from "@playwright/test";
import {
  resolveFixtureDwellMs,
  resolveSlideDwellMs,
  resolveHighlightSlots,
  FIXTURE_DURATION_MS_DEFAULT,
  FIXTURE_DURATION_FAST_MS_DEFAULT,
} from "../../src/index.js";
import type { Block } from "../../src/index.js";

test.describe("resolveFixtureDwellMs (all fixtures)", () => {
  test("unset duration -> null (legacy timing)", () => {
    expect(resolveFixtureDwellMs({})).toBeNull();
    expect(resolveFixtureDwellMs({ duration: false })).toBeNull();
  });

  test("duration: true -> 2000ms default, 600ms under gatesFast", () => {
    expect(resolveFixtureDwellMs({ duration: true })).toBe(FIXTURE_DURATION_MS_DEFAULT);
    expect(resolveFixtureDwellMs({ duration: true }, { gatesFast: true })).toBe(
      FIXTURE_DURATION_FAST_MS_DEFAULT,
    );
  });

  test("duration number override + fastMode", () => {
    expect(resolveFixtureDwellMs({ duration: 3500 })).toBe(3500);
    expect(resolveFixtureDwellMs({ duration: 3500, fastMode: 800 }, { gatesFast: true })).toBe(800);
    expect(resolveFixtureDwellMs({ duration: true, fastMode: 400 }, { gatesFast: true })).toBe(400);
  });

  test("resolveSlideDwellMs aliases resolveFixtureDwellMs", () => {
    expect(resolveSlideDwellMs({ duration: true })).toBe(resolveFixtureDwellMs({ duration: true }));
  });

  test("flow fixture duration merges onto stubAfter slots", () => {
    const block = {
      name: "finish-order",
      instruction: {
        stubAfter: {
          thanks: { selector: ".complete-header", label: "Thanks" },
        },
        resolve: () => ({ __state: "OrderComplete" }),
        act: async () => {},
      },
    } as unknown as Block<any, any>;
    const slots = resolveHighlightSlots(block, "stubAfter", {
      fixtures: {
        "finish-order": {
          stubAfter: {
            thanks: { label: "Order placed", duration: true, fastMode: 700 },
          },
        },
      },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.duration).toBe(true);
    expect(slots[0]!.fastMode).toBe(700);
    expect(resolveFixtureDwellMs(slots[0]!)).toBe(2000);
    expect(resolveFixtureDwellMs(slots[0]!, { gatesFast: true })).toBe(700);
  });
});
