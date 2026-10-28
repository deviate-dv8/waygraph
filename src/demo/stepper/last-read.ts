// What the page showed after the step the demo is on (its `step:read`), for the after-step panel. A fast-forward unit's
// inner steps don't reset it, so the unit shows the read from where it ended.
import { onRunEvent, type StepRead } from "../../engine/run/events.js";

let last: StepRead | undefined;
let off: (() => void) | undefined;

/** Starts keeping the latest read; a second call does nothing. */
export function trackReads(): void {
  off ??= onRunEvent((event) => {
    if (event.type === "step:start" && event.parent === undefined) last = undefined;
    else if (event.type === "step:read") last = event;
  });
}

/** The read since the current step began, when there is one with something in it. */
export function lastRead(): Record<string, unknown> | undefined {
  return last && Object.keys(last.read).length > 0 ? last.read : undefined;
}
