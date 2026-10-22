import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadsDir, resolveVideoDir } from "../../src/video-dir.js";

const KEYS = ["HOME", "XDG_DOWNLOAD_DIR", "XDG_CONFIG_HOME", "WAYGRAPH_VIDEO_DIR", "CI"];
let saved: Record<string, string | undefined>;
let home: string;
let project: string;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  home = mkdtempSync(join(tmpdir(), "wg-home-"));
  project = join(mkdtempSync(join(tmpdir(), "wg-proj-")), "my-app");
  mkdirSync(project);
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("video dir", () => {
  it("defaults to <Downloads>/waygraph-videos/<project>", async () => {
    mkdirSync(join(home, "Downloads"));
    assert.equal(await resolveVideoDir(project), join(home, "Downloads", "waygraph-videos", "my-app"));
  });

  it("falls back to the project when there is no Downloads folder", async () => {
    assert.equal(downloadsDir(), undefined);
    assert.equal(await resolveVideoDir(project), join(project, ".waygraph-videos"));
  });

  it("uses the project folder on CI even when Downloads exists", async () => {
    mkdirSync(join(home, "Downloads"));
    process.env.CI = "1";
    assert.equal(await resolveVideoDir(project), join(project, ".waygraph-videos"));
  });

  it("finds a localized Downloads folder through user-dirs.dirs", () => {
    mkdirSync(join(home, "Téléchargements"));
    mkdirSync(join(home, ".config"));
    writeFileSync(join(home, ".config", "user-dirs.dirs"), 'XDG_DOWNLOAD_DIR="$HOME/Téléchargements"\n');
    if (process.platform === "linux") assert.equal(downloadsDir(), join(home, "Téléchargements"));
  });

  it("WAYGRAPH_VIDEO_DIR and the config's video.dir (relative to the project) override the default", async () => {
    mkdirSync(join(home, "Downloads"));
    writeFileSync(join(project, "waygraph.config.mjs"), 'export default { video: { dir: "out/vids" } };\n');
    assert.equal(await resolveVideoDir(project), join(project, "out", "vids"));
    process.env.WAYGRAPH_VIDEO_DIR = join(home, "elsewhere");
    assert.equal(await resolveVideoDir(project), join(home, "elsewhere"));
  });

  it("expands ~/ in video.dir", async () => {
    writeFileSync(join(project, "waygraph.config.mjs"), 'export default { video: { dir: "~/clips" } };\n');
    assert.equal(await resolveVideoDir(project), join(home, "clips"));
  });
});
