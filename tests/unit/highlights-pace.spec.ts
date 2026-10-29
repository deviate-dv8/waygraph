import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeHighlightTone, normalizeHighlightSize, normalizeHighlightWeight } from "../../src/engine/stub/ring.js";
import { formatHighlightCaption } from "../../src/demo/narration/style.js";
import {
  normalizeDemoPace,
  resolveFixtureDwellMs,
  resolveStepDemoPace,
  demoPaceScale,
  demoPaceGateMs,
  demoPaceIsSlow,
  demoPaceIsFast,
  formatDemoPaceBadge,
  formatDemoPaceLabel,
  FIXTURE_DURATION_MS_DEFAULT,
  FIXTURE_DURATION_FAST_MS_DEFAULT,
  FIXTURE_DURATION_SLOW_MS_DEFAULT,
} from "../../src/demo/narration/demo-pace.js";

describe("normalizeHighlightTone", () => {
  it("takes its tones; nothing given is planned", () => {
    for (const tone of ["planned", "auto", "info", "warning", "danger", "success", "orange"]) assert.equal(normalizeHighlightTone(tone), tone);
    assert.equal(normalizeHighlightTone(undefined), "planned");
    assert.throws(() => normalizeHighlightTone("error"), /tone "error"/);
  });
});

describe("normalizeHighlightSize / weight", () => {
  it("takes sm / md / lg and normal / bold", () => {
    assert.equal(normalizeHighlightSize("lg"), "lg");
    assert.equal(normalizeHighlightSize(undefined), "md");
    assert.throws(() => normalizeHighlightSize("big"), /size "big"/);
    assert.equal(normalizeHighlightWeight("bold"), "bold");
    assert.equal(normalizeHighlightWeight(undefined), "normal");
    assert.throws(() => normalizeHighlightWeight("strong"), /weight "strong"/);
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
  it("takes blitz / fast / normal / slow; nothing given is normal", () => {
    assert.equal(normalizeDemoPace("blitz"), "blitz");
    assert.equal(normalizeDemoPace(""), "normal");
    assert.throws(() => normalizeDemoPace("quick"), /pace "quick"/);
  });

  it("accepts numeric scale and absolute ms", () => {
    assert.equal(normalizeDemoPace(0.5), 0.5);
    assert.equal(normalizeDemoPace(2), 2);
    assert.equal(normalizeDemoPace(4500), 4500);
    assert.equal(normalizeDemoPace("2"), 2);
    assert.equal(demoPaceScale(2), 2);
    assert.equal(demoPaceGateMs(4500, 1800), 4500);
    assert.equal(demoPaceGateMs(2, 1800), 3600);
    assert.equal(demoPaceIsSlow(2.5), true);
    assert.equal(demoPaceIsFast(0.5), true);
  });

  it("formats loud pace labels for UI/console", () => {
    assert.match(formatDemoPaceLabel(2.5, 1800), /2\.5x/);
    assert.match(formatDemoPaceLabel(2.5, 1800), /4500ms/);
    assert.match(formatDemoPaceLabel(4500, 1800), /4500ms/);
    assert.equal(formatDemoPaceBadge(2.5), "2.5x");
    assert.equal(formatDemoPaceBadge(4500), "4500ms");
    assert.equal(formatDemoPaceBadge("slow"), "slow");
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
    assert.equal(resolveStepDemoPace({ flowPace: 1.75 }), 1.75);
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

  it("scales and absolute ms; authored slow wins over gatesFast", () => {
    assert.equal(resolveFixtureDwellMs({ duration: true }, { pace: 2 }), 4000);
    assert.equal(resolveFixtureDwellMs({ duration: true }, { pace: 4500 }), 4500);
    assert.equal(
      resolveFixtureDwellMs({ duration: true }, { pace: "slow", gatesFast: true }),
      FIXTURE_DURATION_SLOW_MS_DEFAULT,
    );
    assert.equal(
      resolveFixtureDwellMs({ duration: true }, { pace: "normal", gatesFast: true }),
      FIXTURE_DURATION_FAST_MS_DEFAULT,
    );
  });
});
