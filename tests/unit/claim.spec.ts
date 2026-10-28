import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { claimOnce } from "../../src/engine/claim.js";

const exec = promisify(execFile);

describe("claimOnce", () => {
  it("is true once, then false", async () => {
    const name = `test:${Math.random()}`;
    assert.equal(await claimOnce(name), true);
    assert.equal(await claimOnce(name), false);
  });

  it("an expired claim can be claimed again", async () => {
    const name = `test:${Math.random()}`;
    assert.equal(await claimOnce(name), true);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(await claimOnce(name, { ttlMs: 10 }), true);
  });

  it("one winner among processes asking at once", async () => {
    const name = `test:${Math.random()}`;
    const src = join(import.meta.dirname, "..", "..", "src", "engine", "claim.ts");
    const script = `import { claimOnce } from ${JSON.stringify(src)}; console.log(await claimOnce(${JSON.stringify(name)}));`;
    const runs = await Promise.all(
      Array.from({ length: 6 }, () => exec(process.execPath, ["--import", "tsx/esm", "--input-type=module", "-e", script], { cwd: join(import.meta.dirname, "..", "..") })),
    );
    assert.equal(runs.filter((r) => r.stdout.trim() === "true").length, 1);
  });
});
