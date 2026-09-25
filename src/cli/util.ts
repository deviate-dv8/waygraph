// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// `try` - a bundled, self-contained showcase. No .flow.ts to write, no
// scenario to design - copies a small real Flow (nav/action Blocks, Trait
// verify, narrate()) into the target project and runs it in step mode
// against a public demo site, so a curious dev sees the real overlay/panel
// experience in under a minute, then gets pointed at the plain waygraph
// source that produced it.
// ---------------------------------------------------------------------------

/** This package's own installed root - dist/cli.js -> .. */
export function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}


/** Spawns with inherited stdio (the real npm/playwright output, visible) and resolves to its exit code. */
export function runInherited(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", rej);
    child.on("exit", (code) => res(code ?? 1));
  });
}
