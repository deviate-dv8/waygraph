import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(normalizeDevicePreset("mobile"), "mobile");
    assert.equal(normalizeDevicePreset("phone"), "mobile");
    assert.equal(normalizeDevicePreset("tablet"), "tablet");
    assert.equal(normalizeDevicePreset("main"), "desktop");
    assert.equal(normalizeDevicePreset("nope"), undefined);
  });

  it("resolves mobile with touchMode by default", () => {
    const d = resolveDeviceState("mobile");
    assert.equal(d?.preset, "mobile");
    assert.equal(d?.viewport.width, 390);
    assert.equal(d?.touchMode, true);
    assert.equal(d?.isMobile, true);
  });

  it("resolves desktop without touch", () => {
    const d = resolveDeviceState("desktop");
    assert.equal(d?.preset, "desktop");
    assert.equal(d?.touchMode, false);
    assert.equal(d?.viewport.width, 1280);
  });
});

describe("applyDevicePhase (todo-shaped persist)", () => {
  it("keep preserves previous; clear returns desktop", () => {
    const prev = resolveDeviceState("mobile")!;
    const kept = applyDevicePhase(prev, { deviceSync: "keep" });
    assert.equal(kept.sync, "keep");
    assert.equal(kept.device, prev);

    const cleared = applyDevicePhase(prev, { deviceSync: "clear" });
    assert.equal(cleared.sync, "clear");
    assert.equal(cleared.device?.preset, "desktop");
    assert.equal(cleared.device?.touchMode, false);
  });

  it("set replaces with authored device", () => {
    const prev = resolveDeviceState("mobile")!;
    const next = resolveDeviceState("tablet")!;
    const set = applyDevicePhase(prev, { deviceSync: "set", device: next });
    assert.equal(set.sync, "set");
    assert.equal(set.device?.preset, "tablet");
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
    assert.equal(phase.deviceSync, "set");
    assert.equal(phase.device?.preset, "mobile");
    assert.equal(phase.device?.touchMode, true);
    assert.equal(phase.highlights[0]?.gesture, "tap");
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
    assert.equal((await runStubPhase(bare, "stubBefore")).deviceSync, "keep");
    const cleared = await runStubPhase(hide, "stubBefore");
    assert.equal(cleared.deviceSync, "clear");
    assert.equal(cleared.device?.preset, "desktop");
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
    assert.equal(phase.deviceSync, "set");
    assert.equal(phase.device?.touchMode, true);
  });

  it("landscape swaps mobile width/height", async () => {
    const { applyOrientation, resolveDeviceState, normalizeDeviceOrientation } =
      await import("../../src/highlights.js");
    assert.equal(normalizeDeviceOrientation("land"), "landscape");
    assert.equal(normalizeDeviceOrientation("port"), "portrait");
    const mobile = resolveDeviceState("mobile")!;
    assert.ok(mobile.viewport.width < mobile.viewport.height);
    const land = applyOrientation(mobile, "landscape");
    assert.equal(land.viewport.width, 844);
    assert.equal(land.viewport.height, 390);
    assert.equal(land.orientation, "landscape");

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
    assert.equal(phase.deviceSync, "set");
    assert.equal(phase.device?.orientation, "landscape");
    assert.ok(phase.device!.viewport.width > phase.device!.viewport.height);
  });
});
