import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFiles, takeEnvFlag } from "../../src/runtime/env-file.js";
import { applyConfigEnv, defineConfig } from "../../src/runtime/config.js";

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

describe("applyConfigEnv", () => {
  const NAMES = ["WAYGRAPH_SLOWMO", "WAYGRAPH_HEADED", "WAYGRAPH_DEMO_PACE", "WAYGRAPH_TYPING_MS", "WAYGRAPH_AUTOPLAY", "WAYGRAPH_VIDEO_VIEWPORT"];
  let before: Record<string, string | undefined>;
  beforeEach(() => {
    before = Object.fromEntries(NAMES.map((k) => [k, process.env[k]]));
    for (const k of NAMES) delete process.env[k];
  });
  afterEach(() => {
    for (const k of NAMES) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k]!;
    }
  });

  const config = {
    slowMo: 100,
    headed: false,
    video: { viewport: "1280x720" },
    run: { slowMo: 0 },
    demo: { slowMo: 350, headed: true, pace: "fast" as const, typingMs: 5, autoNext: true, video: { viewport: "1920x1080" } },
  };

  it("demo takes the shared values, overridden by its own section, plus its demo-only settings", () => {
    applyConfigEnv(config, "demo");
    assert.equal(process.env.WAYGRAPH_SLOWMO, "350");
    assert.equal(process.env.WAYGRAPH_HEADED, "1");
    assert.equal(process.env.WAYGRAPH_VIDEO_VIEWPORT, "1920x1080");
    assert.equal(process.env.WAYGRAPH_DEMO_PACE, "fast");
    assert.equal(process.env.WAYGRAPH_TYPING_MS, "5");
    assert.equal(process.env.WAYGRAPH_AUTOPLAY, "1");
  });

  it("run takes its own section and none of the demo-only settings", () => {
    applyConfigEnv(config, "run");
    assert.equal(process.env.WAYGRAPH_SLOWMO, "0");
    assert.equal(process.env.WAYGRAPH_HEADED, "0");
    assert.equal(process.env.WAYGRAPH_VIDEO_VIEWPORT, "1280x720");
    assert.equal(process.env.WAYGRAPH_DEMO_PACE, undefined);
    assert.equal(process.env.WAYGRAPH_TYPING_MS, undefined);
  });

  it("any other command gets only the shared values", () => {
    applyConfigEnv(config, "auto");
    assert.equal(process.env.WAYGRAPH_SLOWMO, "100");
    assert.equal(process.env.WAYGRAPH_DEMO_PACE, undefined);
  });

  it("never overrides something already set", () => {
    process.env.WAYGRAPH_SLOWMO = "999";
    applyConfigEnv(config, "demo");
    assert.equal(process.env.WAYGRAPH_SLOWMO, "999");
  });
});

describe("pace speeds", () => {
  it("demo.speeds redefines the named paces; defaults otherwise", async () => {
    const { demoPaceScale } = await import("../../src/highlights/demo-pace.js");
    delete process.env.WAYGRAPH_PACE_SPEEDS;
    assert.equal(demoPaceScale("fast"), 0.33);
    applyConfigEnv({ demo: { speeds: { fast: 0.5, blitz: 0.1 } } }, "demo");
    assert.equal(demoPaceScale("fast"), 0.5);
    assert.equal(demoPaceScale("blitz"), 0.1);
    assert.equal(demoPaceScale("slow"), 2);
    delete process.env.WAYGRAPH_PACE_SPEEDS;
  });
});

describe("--config", () => {
  it("takeConfigFlag removes the flag and records it", async () => {
    const { takeConfigFlag } = await import("../../src/runtime/config.js");
    assert.deepEqual(takeConfigFlag(["test", "--config", "staging", "x"]), ["test", "x"]);
    assert.equal(process.env.WAYGRAPH_CONFIG, "staging");
    assert.deepEqual(takeConfigFlag(["run", "--config=config/a.ts"]), ["run"]);
    assert.equal(process.env.WAYGRAPH_CONFIG, "config/a.ts");
    delete process.env.WAYGRAPH_CONFIG;
  });

  it("a short name finds config/waygraph.<name>.config.*; a missing one fails loudly", async () => {
    const { loadWaygraphConfig } = await import("../../src/runtime/config.js");
    mkdirSync(join(dir, "config"));
    writeFileSync(join(dir, "config", "waygraph.config.mjs"), 'export default { baseUrl: "https://default.example.com" };\n');
    writeFileSync(join(dir, "config", "waygraph.staging.config.mjs"), 'export default { baseUrl: "https://staging.example.com" };\n');
    delete process.env.WAYGRAPH_CONFIG;
    assert.equal((await loadWaygraphConfig(dir))?.baseUrl, "https://default.example.com");
    process.env.WAYGRAPH_CONFIG = "staging";
    assert.equal((await loadWaygraphConfig(dir))?.baseUrl, "https://staging.example.com");
    process.env.WAYGRAPH_CONFIG = "nope";
    await assert.rejects(loadWaygraphConfig(dir), /not found/);
    delete process.env.WAYGRAPH_CONFIG;
  });
});
