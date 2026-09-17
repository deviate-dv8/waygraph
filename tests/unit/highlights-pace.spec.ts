import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHighlightTone,
  normalizeDemoPace,
  formatHighlightCaption,
  resolveFixtureDwellMs,
  resolveStepDemoPace,
  FIXTURE_DURATION_MS_DEFAULT,
  FIXTURE_DURATION_FAST_MS_DEFAULT,
  FIXTURE_DURATION_SLOW_MS_DEFAULT,
} from "../../dist/highlights.js";

describe("normalizeHighlightTone", () => {
  it("maps aliases to canonical tones", () => {
    assert.equal(normalizeHighlightTone("auto"), "auto");
    assert.equal(normalizeHighlightTone("automation"), "auto");
    assert.equal(normalizeHighlightTone("warn"), "warning");
    assert.equal(normalizeHighlightTone("error"), "danger");
    assert.equal(normalizeHighlightTone("blue"), "info");
    assert.equal(normalizeHighlightTone("ok"), "success");
    assert.equal(normalizeHighlightTone("purple"), "planned");
    assert.equal(normalizeHighlightTone(undefined), "planned");
  });
});

describe("formatHighlightCaption", () => {
  it("prefixes semantic tones with ASCII icons", () => {
    assert.equal(formatHighlightCaption({ label: "Gap", tone: "warning" }), "[!] Gap");
    assert.equal(formatHighlightCaption({ label: "Fail", tone: "danger" }), "[x] Fail");
    assert.equal(formatHighlightCaption({ label: "Ok", tone: "success" }), "[+] Ok");
    assert.equal(formatHighlightCaption({ label: "Note", tone: "info" }), "[i] Note");
    assert.equal(formatHighlightCaption({ label: "Narrate", tone: "planned" }), "Narrate");
    assert.equal(formatHighlightCaption({ label: "Engine", tone: "auto" }), "Engine");
  });

  it("keeps detail and tag with icon", () => {
    assert.equal(
      formatHighlightCaption({ label: "Field", detail: "required", tag: "BUG", tone: "danger" }),
      "[x] [BUG] Field - required",
    );
  });
});

describe("normalizeDemoPace / resolveStepDemoPace", () => {
  it("normalizes pace aliases", () => {
    assert.equal(normalizeDemoPace("ff"), "blitz");
    assert.equal(normalizeDemoPace("quick"), "fast");
    assert.equal(normalizeDemoPace("review"), "slow");
    assert.equal(normalizeDemoPace(""), "normal");
  });

  it("FF wins over flow/block pace", () => {
    assert.equal(
      resolveStepDemoPace({ blockPace: "slow", flowPace: "fast", fastForward: true }),
      "blitz",
    );
    assert.equal(resolveStepDemoPace({ blockPace: "slow", wasFastForward: true }), "blitz");
  });

  it("block pace overrides flow pace", () => {
    assert.equal(resolveStepDemoPace({ blockPace: "slow", flowPace: "fast" }), "slow");
    assert.equal(resolveStepDemoPace({ flowPace: "fast" }), "fast");
  });
});

describe("resolveFixtureDwellMs pace", () => {
  it("uses slow default when pace is slow", () => {
    assert.equal(
      resolveFixtureDwellMs({ duration: true }, { pace: "slow" }),
      FIXTURE_DURATION_SLOW_MS_DEFAULT,
    );
    assert.equal(
      resolveFixtureDwellMs({ duration: true }, { pace: "fast" }),
      FIXTURE_DURATION_FAST_MS_DEFAULT,
    );
    assert.equal(
      resolveFixtureDwellMs({ duration: true }, { pace: "normal" }),
      FIXTURE_DURATION_MS_DEFAULT,
    );
  });
});
