// The demo's Next gate: waits for the panel's Next click, or counts down when "Auto-advance" is checked. The checkbox
// is re-read every tick, so a person can switch between manual and automatic mid-demo.
import type { WgPage } from "../types.js";
import { demoPaceGateMs } from "../narration/demo-pace.js";
import type { Pacing } from "./pacing.js";
import { envFlag, envNumber, envString } from "../../engine/env.js";

export interface Gate {
  /** Resolves with the mem edits typed into the panel (or `{}` when auto-advance moved on). */
  wait(): Promise<Record<string, string>>;
  /** Puts the panel's Auto-advance checkbox to WAYGRAPH_AUTOPLAY (after start and after a session reset). */
  syncAutoplay(): Promise<void>;
  /** Base auto-advance delay, scaled by each step's pace. */
  autoplayMs: number;
}

export async function installGate(page: WgPage, pacing: Pacing, demoFast: boolean): Promise<Gate> {
  const autoplayMs = envNumber("WAYGRAPH_AUTOPLAY_MS") ?? (demoFast ? 450 : 1800);

  // installOverlay only seeds the checkbox when unset (so a mid-run click survives navigation); the CLI flag must
  // still win at start. localStorage is per origin, so this runs on the demo's page, not about:blank.
  const syncAutoplay = async (): Promise<void> => {
    if (envString("WAYGRAPH_AUTOPLAY") === undefined) return;
    const on = envFlag("WAYGRAPH_AUTOPLAY");
    await page
      .evaluate((want: boolean) => {
        try {
          localStorage.setItem("wg-autoplay", want ? "1" : "0");
        } catch {
          /* private mode / blocked storage */
        }
      }, on)
      .catch(() => {});
  };

  // A Next click can land before wait() starts listening (there is an await in between on the slides path); keep it
  // for the next wait() instead of dropping it, or the panel looks stuck.
  let resolveNext: ((edits: Record<string, string>) => void) | null = null;
  let pendingNext: Record<string, string> | null = null;
  await page.exposeFunction("__wgNext", (edits: Record<string, string>) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(edits);
    } else {
      pendingNext = edits;
    }
  });
  const waitForNext = () =>
    new Promise<Record<string, string>>((res) => {
      if (pendingNext !== null) {
        const edits = pendingNext;
        pendingNext = null;
        res(edits);
        return;
      }
      resolveNext = res;
    });
  const autoplayOn = () =>
    page
      .evaluate(() => {
        try {
          return localStorage.getItem("wg-autoplay") === "1";
        } catch {
          return false;
        }
      })
      .catch(() => false);

  const wait = async (): Promise<Record<string, string>> => {
    const next = waitForNext();
    // A step that skips the theater (WAYGRAPH_FAST_BLOCKS, fast-forward) blows past its gates too.
    const ms = demoPaceGateMs(pacing.skipTheater ? "blitz" : pacing.demoPace, autoplayMs);
    let elapsed = 0;
    for (;;) {
      const auto = await autoplayOn();
      const slice = auto ? Math.min(250, Math.max(50, ms - elapsed)) : 250;
      const winner = await Promise.race([
        next.then((edits) => ({ clicked: true as const, edits })),
        new Promise<{ clicked: false }>((res) => setTimeout(() => res({ clicked: false }), slice)),
      ]);
      if (winner.clicked) return winner.edits;
      if (!auto) continue;
      elapsed += slice;
      if (elapsed >= ms) return {};
    }
  };
  return { wait, syncAutoplay, autoplayMs };
}
