import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFiles, takeEnvFlag } from "../../src/env-file.js";
import { defineConfig } from "../../src/config.js";

const KEYS = ["WG_T_BASE", "WG_T_ONLY_ENV", "WG_T_SHELL", "WAYGRAPH_ENV", "NODE_ENV"];
let saved: Record<string, string | undefined>;
let dir: string;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  dir = mkdtempSync(join(tmpdir(), "wg-env-"));
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("env files", () => {
  it("layers .env < .env.local < .env.<mode> < .env.<mode>.local", () => {
    writeFileSync(join(dir, ".env"), "WG_T_BASE=env\nWG_T_ONLY_ENV=kept\n");
    writeFileSync(join(dir, ".env.local"), "WG_T_BASE=local\n");
    writeFileSync(join(dir, ".env.staging"), "WG_T_BASE=staging\n");
    loadEnvFiles(dir, "staging");
    assert.equal(process.env.WG_T_BASE, "staging");
    assert.equal(process.env.WG_T_ONLY_ENV, "kept");
    writeFileSync(join(dir, ".env.staging.local"), "WG_T_BASE=staging-local\n");
    delete process.env.WG_T_BASE;
    loadEnvFiles(dir, "staging");
    assert.equal(process.env.WG_T_BASE, "staging-local");
  });

  it("never overrides a value the shell exported", () => {
    process.env.WG_T_SHELL = "shell";
    writeFileSync(join(dir, ".env"), "WG_T_SHELL=file\n");
    loadEnvFiles(dir, "development");
    assert.equal(process.env.WG_T_SHELL, "shell");
  });

  it("--env <mode> picks the mode and is removed from the forwarded args", () => {
    assert.deepEqual(takeEnvFlag(["test", "--env", "staging", "--grep", "x"]), ["test", "--grep", "x"]);
    assert.equal(process.env.WAYGRAPH_ENV, "staging");
    assert.deepEqual(takeEnvFlag(["run", "--env=prod"]), ["run"]);
    assert.equal(process.env.WAYGRAPH_ENV, "prod");
  });
});

describe("defineConfig", () => {
  it("returns an object as given", () => {
    assert.deepEqual(defineConfig({ baseUrl: "x" }), { baseUrl: "x" });
  });

  it("calls a function with the mode and the loaded env", () => {
    const cwd = process.cwd();
    writeFileSync(join(dir, ".env.staging"), "WG_T_BASE=https://staging.example.com\n");
    process.env.WAYGRAPH_ENV = "staging";
    process.chdir(dir);
    try {
      const config = defineConfig(({ mode, env }) => ({ baseUrl: `${env.WG_T_BASE}#${mode}` }));
      assert.equal(config.baseUrl, "https://staging.example.com#staging");
    } finally {
      process.chdir(cwd);
    }
  });
});
