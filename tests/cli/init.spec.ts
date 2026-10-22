import { test, expect } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("init from a checkout depends on a packed local build, not the published version", () => {
  const root = mkdtempSync(join(tmpdir(), "wg-init-"));
  try {
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "../../bin/waygraph"), "init", "p"], { cwd: root, encoding: "utf8" });
    expect(run.status).toBe(0);
    const proj = join(root, "p");
    const dep = JSON.parse(readFileSync(join(proj, "package.json"), "utf8")).dependencies.waygraph as string;
    expect(dep).toMatch(/^file:\.waygraph-local\/waygraph-.*\.tgz$/);
    expect(existsSync(join(proj, dep.slice("file:".length)))).toBe(true);
    expect(readFileSync(join(proj, ".gitignore"), "utf8")).toContain(".waygraph-local/");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
