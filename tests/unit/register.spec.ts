import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerSelectorFor } from "../../src/live/auto-session/register.js";

test("register writes a picked selector into the page's _sel.ts, once", () => {
  const dir = mkdtempSync(join(tmpdir(), "wg-register-"));
  mkdirSync(join(dir, "src/map/home"), { recursive: true });
  writeFileSync(join(dir, "src/map/home/_sel.ts"), 'export const HomeSel = {\n  title: "h1",\n} as const;\n');
  const page = { block: { __waygraphKind: "page", __waygraphTo: ["Home"] }, file: "src/map/home/_page.block.ts" } as never;
  assert.deepEqual(registerSelectorFor(dir, [page], "Home", "saveDraft", "#save-draft"), { ok: true, file: "src/map/home/_sel.ts", name: "HomeSel.saveDraft" });
  assert.match(readFileSync(join(dir, "src/map/home/_sel.ts"), "utf8"), /saveDraft: "#save-draft"/);
  assert.equal(registerSelectorFor(dir, [page], "Home", "saveDraft", "#x").ok, false);
  assert.equal(registerSelectorFor(dir, [page], "Nope", "a", "#x").ok, false);
  assert.equal(registerSelectorFor(dir, [page], "Home", "bad key", "#x").ok, false);
});
