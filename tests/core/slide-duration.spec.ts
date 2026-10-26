import { test, expect } from "@playwright/test";
import type { StubCtx } from "../../src/engine/stub/stub.js";
import {
  resolveFixtureDwellMs,
  resolveHighlightSlots,
  runStubPhase,
  FIXTURE_DURATION_MS_DEFAULT,
  FIXTURE_DURATION_FAST_MS_DEFAULT,
} from "../../src/index.js";
import type { Block } from "../../src/index.js";

test.describe("resolveFixtureDwellMs (all fixtures)", () => {
  test("unset duration -> null (default timing)", () => {
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

  test("flow fixture duration merges onto stubAfter slots", () => {
    const block = {
      name: "finish-order",
      instruction: {
        stubAfter: (ctx: StubCtx) => {
          ctx.ring("thanks", { selector: ".complete-header", label: "Thanks", duration: true, fastMode: 700 });
        },
        resolve: () => ({ __state: "OrderComplete" }),
        act: async () => {},
      },
    } as unknown as Block<any, any>;
    const slots = resolveHighlightSlots(block, "stubAfter");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.duration).toBe(true);
    expect(slots[0]!.fastMode).toBe(700);
    expect(resolveFixtureDwellMs(slots[0]!)).toBe(2000);
    expect(resolveFixtureDwellMs(slots[0]!, { gatesFast: true })).toBe(700);
  });
});

test.describe("ctx.slides", () => {
  const block = (instruction: Record<string, unknown>) =>
    ({ name: "finish-order", instruction: { act: async () => {}, resolve: () => ({ __state: "OrderComplete" }), ...instruction } }) as unknown as Block<any, any>;

  test("a stubBefore or stubAfter phase returns its slides, in order", async () => {
    const b = block({
      stubBefore: (ctx: StubCtx) => ctx.slides([{ caption: "Before" }]),
      stubAfter: (ctx: StubCtx) => ctx.slides([{ caption: "One", tag: "YAP" }, { caption: String(ctx.out?.__state) }]),
    });
    expect((await runStubPhase(b, "stubBefore")).slides.map((s) => s.caption)).toEqual(["Before"]);
    const after = await runStubPhase(b, "stubAfter", { out: { __state: "OrderComplete" } });
    expect(after.slides.map((s) => s.caption)).toEqual(["One", "OrderComplete"]);
  });

  test("a phase without slides returns none", async () => {
    expect((await runStubPhase(block({ stubAfter: (ctx: StubCtx) => ctx.caption("x") }), "stubAfter")).slides).toEqual([]);
  });

  test("slides in stubOnError fail the stub, naming the Block", async () => {
    const b = block({ stubOnError: (ctx: StubCtx) => ctx.slides([{ caption: "Nope" }]) });
    await expect(runStubPhase(b, "stubOnError")).rejects.toThrow(/finish-order: its stubOnError stub set slides/);
  });
});
