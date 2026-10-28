// Claims: something only one run may take - the newest email for a recipient, a seeded account from a pool - when
// parallel workers (or a second CLI run) would otherwise all grab the same one.
import { createHash } from "node:crypto";
import { mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(tmpdir(), "waygraph-claims");

/**
 * Claims `name` for this run: true the first time any process on this machine asks, false after (until `ttlMs`
 * passes - default 30 minutes - so a later run can claim it again). Atomic: two workers asking at once get one true.
 * @example
 * for (const row of await rows.all()) {
 *   if (await claimOnce(`mail:${await row.getAttribute("href")}`)) return row.click();
 * }
 */
export async function claimOnce(name: string, opts?: { ttlMs?: number }): Promise<boolean> {
  const ttlMs = opts?.ttlMs ?? 30 * 60_000;
  mkdirSync(DIR, { recursive: true });
  const file = join(DIR, createHash("sha1").update(name).digest("hex"));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // "wx": create, failing if it exists - the one atomic step that decides who claimed it.
      writeFileSync(file, `${process.pid} ${name}`, { flag: "wx" });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // An expired claim is taken back once; a live one belongs to someone else.
      if (attempt > 0 || Date.now() - statSync(file).mtimeMs < ttlMs) return false;
      try {
        unlinkSync(file);
      } catch (unlinkErr) {
        if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
      }
    }
  }
  return false;
}
