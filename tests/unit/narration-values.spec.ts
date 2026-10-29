import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeHighlightTone } from "../../src/engine/stub/ring.js";
import { normalizeDemoPace } from "../../src/demo/narration/demo-pace.js";
import { normalizeDevicePreset } from "../../src/demo/narration/device.js";

describe("narration values", () => {
  it("take their documented values; nothing given is the default", () => {
    assert.equal(normalizeHighlightTone("danger"), "danger");
    assert.equal(normalizeHighlightTone(undefined), "planned");
    assert.equal(normalizeDevicePreset("tablet"), "tablet");
    assert.equal(normalizeDemoPace("fast"), "fast");
    assert.equal(normalizeDemoPace("0.5"), 0.5);
    assert.equal(normalizeDemoPace(2), 2);
  });

  it("refuse another spelling, naming the values they take", () => {
    assert.throws(() => normalizeHighlightTone("error"), /tone "error" isn't one of "planned", "auto", "info", "warning", "danger"/);
    assert.throws(() => normalizeDevicePreset("phone"), /device "phone" isn't one of "mobile", "tablet", "desktop"/);
    assert.throws(() => normalizeDemoPace("2x"), /pace "2x"/);
  });
});
