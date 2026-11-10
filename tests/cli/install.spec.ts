import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

// `waygraph install` sets up what the project's config requires: the browser (the project's Playwright), the demo's
// voice, the .env entries they read; what it can't set up, it names, and exits 1.
test.describe.configure({ mode: "serial" });

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-install");

function project(config: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "install-test", type: "module" }));
  writeFileSync(join(dir, "config", "waygraph.config.ts"), config);
  // The config imports waygraph: this checkout.
  mkdirSync(join(dir, "node_modules"));
  symlinkSync(join(import.meta.dirname, "..", ".."), join(dir, "node_modules", "waygraph"), "dir");
}

test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("installs the browser and lists the voice's key in .env.example and .env", async () => {
  project(`import { defineConfig, openAIVoice } from "waygraph";
export default defineConfig({ demo: { voice: { speaker: openAIVoice() } } });
`);
  const { stdout } = await exec(process.execPath, [CLI, "install", dir], { cwd: dir });
  expect(stdout).toContain("waygraph install: browsers chromium (the project's Playwright)");
  expect(stdout).toContain("listed OPENAI_API_KEY in .env.example and .env");
  expect(stdout).toContain("everything the config requires is ready");
  for (const file of [".env.example", ".env"]) {
    expect(readFileSync(join(dir, file), "utf8")).toBe(
      "# waygraph install: the demo's voice (demo.voice)\n# the key the speech API takes (openAIVoice)\n# OPENAI_API_KEY=\n",
    );
  }
  // Again: nothing more to list.
  const again = await exec(process.execPath, [CLI, "install", dir], { cwd: dir });
  expect(again.stdout).not.toContain("listed");
});

test("a voice it can't set up is named at the end, after the rest, and the install exits 1", async () => {
  project(`import { defineConfig } from "waygraph";
const speaker = {
  id: "broken",
  ext: "wav",
  synthesize: async () => {},
  install: async () => { throw new Error("no Python here"); },
};
export default defineConfig({ demo: { voice: { speaker } } });
`);
  const failed = await exec(process.execPath, [CLI, "install", dir], { cwd: dir }).then(
    () => null,
    (err: { code: number; stdout: string }) => err,
  );
  expect(failed?.code).toBe(1);
  expect(failed?.stdout).toContain("waygraph install: browsers chromium");
  expect(failed?.stdout).toMatch(/can't install:\n {2}- the demo's voice: no Python here/);
});
