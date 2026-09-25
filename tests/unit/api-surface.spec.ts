import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "../../src/index.js";

/**
 * Guards the public API during refactors/splits: every runtime export of src/index.ts must
 * still exist (and nothing appears unannounced). If you intentionally add/remove an export,
 * regenerate the snapshot:
 *   node --import tsx/esm -e 'import * as a from "./src/index.ts"; import {writeFileSync} from "node:fs"; writeFileSync("tests/unit/api-surface.snapshot.json", JSON.stringify(Object.keys(a).sort(), null, 2)+"\n")'
 */
describe("public API surface", () => {
  const expected: string[] = JSON.parse(
    readFileSync(join(import.meta.dirname, "api-surface.snapshot.json"), "utf8"),
  );
  const actual = Object.keys(api).sort();

  it("exports nothing that was in the snapshot removed", () => {
    const missing = expected.filter((n) => !actual.includes(n));
    assert.deepEqual(missing, [], `removed exports: ${missing.join(", ")}`);
  });

  it("exports nothing new that isn't in the snapshot", () => {
    const added = actual.filter((n) => !expected.includes(n));
    assert.deepEqual(added, [], `new exports (update the snapshot if intended): ${added.join(", ")}`);
  });
});
