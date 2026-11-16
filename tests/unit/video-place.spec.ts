import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandVideoName, placeVideo } from "../../src/runtime/video-place.js";

const target = { flow: "checkoutFlow", title: "Check out: the happy path!", label: "Checkout" };

test("a video name's tokens become path pieces", () => {
  const now = new Date("2026-11-16T14:05:09Z");
  assert.equal(expandVideoName("{label}/{title}", target, undefined, now), "checkout/check-out-the-happy-path");
  assert.equal(expandVideoName("{flow}-{date}-{time}", target, undefined, now), "checkoutflow-2026-11-16-14-05-09");
  assert.equal(expandVideoName("../{title}/./{pane}", target, "Mail", now), "check-out-the-happy-path/mail");
});

test("a recording moves to the folder and name the flow says, with its subtitles, and never overwrites", () => {
  const dir = mkdtempSync(join(tmpdir(), "wg-video-"));
  const make = (name: string) => {
    const file = join(dir, name);
    writeFileSync(file, "x");
    writeFileSync(file.replace(".webm", ".vtt"), "WEBVTT");
    return file;
  };
  const meta = { ...target, folder: "auth/{label}", name: "{title}" };
  const first = placeVideo(make("a1.webm"), dir, meta);
  assert.equal(first, join(dir, "auth/checkout/check-out-the-happy-path.webm"));
  assert.ok(existsSync(first.replace(".webm", ".vtt")));
  assert.equal(placeVideo(make("a2.webm"), dir, meta), join(dir, "auth/checkout/check-out-the-happy-path-2.webm"));
  assert.equal(placeVideo(make("a3.webm"), dir, meta, "mail"), join(dir, "auth/checkout/check-out-the-happy-path-mail.webm"));
  assert.equal(placeVideo(join(dir, "kept.webm"), dir, undefined), join(dir, "kept.webm"));
});
