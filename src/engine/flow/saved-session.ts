// An account's session saved between processes: `.waygraph/sessions/` (WAYGRAPH_SESSIONS), one file per account, site
// and person, read back by a later run or test worker until its time to live runs out. Only an account with a `ttl`
// is saved: without one, nothing says how long the app keeps a session.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { envFlag, envString } from "../env.js";

export type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** A session and when it stops being good (ms since the epoch). */
export interface TimedSession {
  state: Session;
  expiresAt: number;
}

/** `"30s"`, `"15m"`, `"2h"`, `"1d"`, or ms. */
export type Duration = number | `${number}${"s" | "m" | "h" | "d"}`;

const UNIT = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** A duration in ms; throws on anything else, naming what it got. */
export function durationMs(value: Duration): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const m = typeof value === "string" ? value.trim().match(/^(\d+(?:\.\d+)?)\s*([smhd])$/) : null;
  if (!m?.[1] || !m[2]) throw new Error(`waygraph: a ttl is a number of ms or "30s" / "15m" / "2h" / "1d"; got ${JSON.stringify(value)}`);
  return Number(m[1]) * UNIT[m[2] as keyof typeof UNIT];
}

/** The folder saved sessions live in; undefined when saving is off (`WAYGRAPH_SESSIONS=0`, or nothing set it). */
function folder(): string | undefined {
  const dir = envString("WAYGRAPH_SESSIONS");
  return dir && dir !== "0" ? dir : undefined;
}

/**
 * The file for an account's session: by its name, the site (base url) and who the person is (the data its `mem` sets),
 * so a session for staging is never used locally, nor one person's for another.
 */
function fileOf(dir: string, account: string, person: string): string {
  const site = envString("WAYGRAPH_BASE_URL") ?? "";
  const hash = createHash("sha256").update(`${site}\n${person}`).digest("hex").slice(0, 12);
  return join(dir, `${account.replace(/[^\w.-]+/g, "_")}-${hash}.json`);
}

/** The saved session, when there is one still good. */
export function readSaved(account: string, person: string, now = Date.now()): TimedSession | undefined {
  const dir = folder();
  if (!dir || envFlag("WAYGRAPH_FRESH_SESSIONS")) return undefined;
  const file = fileOf(dir, account, person);
  if (!existsSync(file)) return undefined;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")) as TimedSession;
    if (typeof saved.expiresAt === "number" && saved.expiresAt > now && saved.state) return saved;
  } catch {
    // A file cut off or hand-edited is the same as none: the account signs in again and writes a new one.
  }
  return undefined;
}

/** Saves a session for later processes: written whole, then moved into place, readable only by its owner. */
export function writeSaved(account: string, person: string, session: TimedSession): void {
  const dir = folder();
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const file = fileOf(dir, account, person);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(session), { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, file);
}
