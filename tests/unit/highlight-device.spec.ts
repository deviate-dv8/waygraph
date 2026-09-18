import { describe, expect, it } from "vitest";
import {
  applyDevicePhase,
  normalizeDevicePreset,
  resolveDeviceState,
  runStubPhase,
} from "../../src/highlights.js";
import type { Block } from "../../src/types.js";
import type { StubCtx } from "../../src/highlights.js";

describe("device presets + resolve", () => {
  it("normalizes aliases", () => {
    expect(normalizeDevicePreset("mobile")).toBe("mobile");
    expect(normalizeDevicePreset("phone")).toBe("mobile");
    expect(normalizeDevicePreset("tablet")).toBe("tablet");
    expect(normalizeDevicePreset("main")).toBe("desktop");
    expect(normalizeDevicePreset("nope")).toBeUndefined();
  });

  it("resolves mobile with touchMode by default", () => {
    const d = resolveDeviceState("mobile");
    expect(d?.preset).toBe("mobile");
    expect(d?.viewport.width).toBe(390);
    expect(d?.touchMode).toBe(true);
    expect(d?.isMobile).toBe(true);
  });

  it("resolves desktop without touch", () => {
    const d = resolveDeviceState("desktop");
    expect(d?.preset).toBe("desktop");
    expect(d?.touchMode).toBe(false);
    expect(d?.viewport.width).toBe(1280);
  });
});

describe("applyDevicePhase (todo-shaped persist)", () => {
  it("keep preserves previous; clear returns desktop", () => {
    const prev = resolveDeviceState("mobile")!;
    const kept = applyDevicePhase(prev, { deviceSync: "keep" });
    expect(kept.sync).toBe("keep");
    expect(kept.device).toBe(prev);

    const cleared = applyDevicePhase(prev, { deviceSync: "clear" });
    expect(cleared.sync).toBe("clear");
    expect(cleared.device?.preset).toBe("desktop");
    expect(cleared.device?.touchMode).toBe(false);
  });

  it("set replaces with authored device", () => {
    const prev = resolveDeviceState("mobile")!;
    const next = resolveDeviceState("tablet")!;
    const set = applyDevicePhase(prev, { deviceSync: "set", device: next });
    expect(set.sync).toBe("set");
    expect(set.device?.preset).toBe("tablet");
  });
});

describe("ctx.device / touch / clearDevice via runStubPhase", () => {
  it("device(mobile) sets deviceSync set + touchMode", async () => {
    const block = {
      name: "login",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.device("mobile");
          ctx.ring("x", { selector: "#x", label: "X", gesture: "tap" });
        },
      },
    } as unknown as Block<any, any>;
    const phase = await runStubPhase(block, "stubBefore");
    expect(phase.deviceSync).toBe("set");
    expect(phase.device?.preset).toBe("mobile");
    expect(phase.device?.touchMode).toBe(true);
    expect(phase.highlights[0]?.gesture).toBe("tap");
  });

  it("omit device => keep; clearDevice => clear", async () => {
    const bare = {
      name: "bare",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.ring("x", { selector: "#x", label: "X" });
        },
      },
    } as unknown as Block<any, any>;
    const hide = {
      name: "hide",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.clearDevice();
        },
      },
    } as unknown as Block<any, any>;
    expect((await runStubPhase(bare, "stubBefore")).deviceSync).toBe("keep");
    const cleared = await runStubPhase(hide, "stubBefore");
    expect(cleared.deviceSync).toBe("clear");
    expect(cleared.device?.preset).toBe("desktop");
  });

  it("touch(true) alone enables theater on desktop-sized state", async () => {
    const block = {
      name: "touch-only",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.touch(true);
        },
      },
    } as unknown as Block<any, any>;
    const phase = await runStubPhase(block, "stubBefore");
    expect(phase.deviceSync).toBe("set");
    expect(phase.device?.touchMode).toBe(true);
  });

  it("landscape swaps mobile width/height", async () => {
    const { applyOrientation, resolveDeviceState, normalizeDeviceOrientation } =
      await import("../../src/highlights.js");
    expect(normalizeDeviceOrientation("land")).toBe("landscape");
    expect(normalizeDeviceOrientation("port")).toBe("portrait");
    const mobile = resolveDeviceState("mobile")!;
    expect(mobile.viewport.width).toBeLessThan(mobile.viewport.height);
    const land = applyOrientation(mobile, "landscape");
    expect(land.viewport.width).toBe(844);
    expect(land.viewport.height).toBe(390);
    expect(land.orientation).toBe("landscape");

    const block = {
      name: "rotate",
      instruction: {
        stubBefore: (ctx: StubCtx) => {
          ctx.device("mobile");
          ctx.landscape();
        },
      },
    } as unknown as Block<any, any>;
    const phase = await runStubPhase(block, "stubBefore");
    expect(phase.deviceSync).toBe("set");
    expect(phase.device?.orientation).toBe("landscape");
    expect(phase.device?.viewport.width).toBeGreaterThan(phase.device!.viewport.height);
  });
});
