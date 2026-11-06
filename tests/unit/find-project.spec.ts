import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectDir } from "../../src/runtime/waygraph-config.js";

function tmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "wg-find-")));
}

describe("findProjectDir", () => {
  it("finds the project from a folder inside it, by its config", () => {
    const root = tmp();
    mkdirSync(join(root, "config"));
    writeFileSync(join(root, "config", "waygraph.config.ts"), "export default {};\n");
    mkdirSync(join(root, "src", "flows"), { recursive: true });
    assert.equal(findProjectDir(join(root, "src", "flows")), root);
  });

  it("finds a project with no config by its waygraph dependency", () => {
    const root = tmp();
    writeFileSync(join(root, "package.json"), JSON.stringify({ devDependencies: { waygraph: "^0.16.0" } }));
    mkdirSync(join(root, "src"));
    assert.equal(findProjectDir(join(root, "src")), root);
  });

  it("skips a package.json that doesn't depend on waygraph", () => {
    const root = tmp();
    writeFileSync(join(root, "waygraph.config.ts"), "export default {};\n");
    const inner = join(root, "tools");
    mkdirSync(inner);
    writeFileSync(join(inner, "package.json"), JSON.stringify({ dependencies: { yaml: "^2.0.0" } }));
    assert.equal(findProjectDir(inner), root);
  });
});
