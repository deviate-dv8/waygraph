import { test } from "node:test";
import assert from "node:assert/strict";
import { WaygraphError, WAYGRAPH_ERRORS } from "../../src/errors.js";

test("every WaygraphError code has a where/means/fix entry", () => {
  for (const [code, info] of Object.entries(WAYGRAPH_ERRORS)) {
    assert.ok(info.where, `${code} missing where`);
    assert.ok(info.means, `${code} missing means`);
    assert.ok(info.fix, `${code} missing fix`);
  }
});

test("WaygraphError.message is prefixed with [code], and .code is readable separately", () => {
  const err = new WaygraphError("WG_PREFLIGHT_MISSING_KEY", "preflight: missing X");
  assert.equal(err.code, "WG_PREFLIGHT_MISSING_KEY");
  assert.equal(err.message, "[WG_PREFLIGHT_MISSING_KEY] preflight: missing X");
  assert.equal(err.name, "WaygraphError");
  assert.ok(err instanceof Error);
});

test("a real preflight failure throws a WaygraphError with .code, not a plain Error", async () => {
  const { preflight } = await import("../../src/engine/run-graph.js");
  const { MemPage, key } = await import("../../src/mem-page.js");
  const mem = new MemPage();
  const need = key<string>("needed");
  try {
    preflight(mem, { name: "some-block", requires: [need], instruction: {} } as never);
    assert.fail("expected preflight to throw");
  } catch (err) {
    assert.ok(err instanceof WaygraphError);
    assert.equal((err as InstanceType<typeof WaygraphError>).code, "WG_PREFLIGHT_MISSING_KEY");
    assert.match((err as Error).message, /^\[WG_PREFLIGHT_MISSING_KEY\]/);
  }
});

test("mem.get() on an unset key throws WG_MEM_READ_BEFORE_SET", async () => {
  const { MemPage, key } = await import("../../src/mem-page.js");
  const mem = new MemPage();
  const k = key<string>("unset");
  try {
    mem.get(k);
    assert.fail("expected mem.get to throw");
  } catch (err) {
    assert.ok(err instanceof WaygraphError);
    assert.equal((err as InstanceType<typeof WaygraphError>).code, "WG_MEM_READ_BEFORE_SET");
  }
});
