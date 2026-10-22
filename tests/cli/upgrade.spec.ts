import { test, expect } from "@playwright/test";
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = join(import.meta.dirname, "../../bin/waygraph");
const wg = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...process.env, CHROME_PATH: "", CHROMIUM_PATH: "" } });

test("upgrade reports missing files, copies only the named paths, never overwrites without --overwrite", () => {
  const root = mkdtempSync(join(tmpdir(), "wg-upgrade-"));
  try {
    wg(root, "init", "p");
    const proj = join(root, "p");
    const skill = ".agents/skills/waygraph-convention/SKILL.md";
    expect(existsSync(join(proj, skill))).toBe(true);
    rmSync(join(proj, skill));
    expect(wg(proj, "upgrade").stdout).toContain(`new         ${skill}`);
    wg(proj, "upgrade", ".agents", "--apply");
    expect(existsSync(join(proj, skill))).toBe(true);

    const hop = "src/map/(external)/hoppscotch";
    rmSync(join(proj, hop), { recursive: true });
    writeFileSync(join(proj, "src/flows/home/cart.flow.ts"), "// mine\n");

    const dry = wg(proj, "upgrade");
    expect(dry.stdout).toContain(`new         ${hop}/_sel.ts`);
    expect(dry.stdout).toContain("differs     src/flows/home/cart.flow.ts");
    expect(existsSync(join(proj, hop))).toBe(false);

    wg(proj, "upgrade", hop, "--apply");
    expect(existsSync(join(proj, hop, "_sel.ts"))).toBe(true);
    expect(readFileSync(join(proj, "src/flows/home/cart.flow.ts"), "utf8")).toBe("// mine\n");

    wg(proj, "upgrade", "src/flows/home/cart.flow.ts", "--apply", "--overwrite");
    expect(readFileSync(join(proj, "src/flows/home/cart.flow.ts"), "utf8")).not.toBe("// mine\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
