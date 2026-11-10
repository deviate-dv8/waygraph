import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listEnvVariables } from "../../src/runtime/env-file.js";

const KEY = { name: "OPENAI_API_KEY", about: "the key the speech API takes" };
const CACHE = { name: "WAYGRAPH_CACHE_DIR", about: "where waygraph keeps its downloads" };

describe("listing a project's variables in its .env files", () => {
  it("adds each one blank and commented, under a header, to .env.example and .env (made when missing)", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-env-"));
    writeFileSync(join(dir, ".env.example"), "# BASE_URL=http://localhost:3000");
    assert.deepEqual(listEnvVariables(dir, "the demo's voice", [KEY]), [".env.example", ".env"]);
    assert.equal(
      readFileSync(join(dir, ".env.example"), "utf8"),
      "# BASE_URL=http://localhost:3000\n\n# the demo's voice\n# the key the speech API takes\n# OPENAI_API_KEY=\n",
    );
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), "# the demo's voice\n# the key the speech API takes\n# OPENAI_API_KEY=\n");
  });

  it("leaves a variable a file already names, set or commented, and lists only the others", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-env-"));
    writeFileSync(join(dir, ".env"), "OPENAI_API_KEY=sk-real\n");
    writeFileSync(join(dir, ".env.example"), "# OPENAI_API_KEY=\n");
    assert.deepEqual(listEnvVariables(dir, "voice", [KEY]), []);
    assert.deepEqual(listEnvVariables(dir, "downloads", [KEY, CACHE]), [".env.example", ".env"]);
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), "OPENAI_API_KEY=sk-real\n\n# downloads\n# where waygraph keeps its downloads\n# WAYGRAPH_CACHE_DIR=\n");
    assert.deepEqual(listEnvVariables(dir, "downloads", [KEY, CACHE]), [], "a second install adds nothing");
  });
});
