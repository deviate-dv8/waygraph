import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDevice } from "../../src/engine/flow/device.js";

describe("device", () => {
  it("a name is that device, its usual way round", () => {
    assert.deepEqual(resolveDevice("desktop"), { preset: "desktop", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, orientation: "landscape" });
    assert.deepEqual(resolveDevice("mobile"), { preset: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, orientation: "portrait" });
  });

  it("turned, it's the same device the other way round", () => {
    assert.deepEqual(resolveDevice({ preset: "tablet", orientation: "landscape" }).viewport, { width: 1024, height: 768 });
    assert.deepEqual(resolveDevice({ orientation: "portrait" }).viewport, { width: 720, height: 1280 });
    assert.equal(resolveDevice({ preset: "mobile", orientation: "portrait" }).viewport.height, 844);
  });

  it("a size of its own, on a preset's kind; touch can be said", () => {
    const d = resolveDevice({ width: 1600, height: 900 });
    assert.deepEqual([d.preset, d.viewport, d.isMobile, d.hasTouch], ["desktop", { width: 1600, height: 900 }, false, false]);
    assert.equal(resolveDevice({ preset: "mobile", touch: false }).hasTouch, false);
  });

  it("says what it got when a name or an orientation isn't one", () => {
    assert.throws(() => resolveDevice("phone" as "mobile"), /device "phone" isn't one: "desktop", "tablet" or "mobile"/);
    assert.throws(() => resolveDevice({ orientation: "sideways" as "portrait" }), /orientation "sideways" isn't one/);
  });
});
