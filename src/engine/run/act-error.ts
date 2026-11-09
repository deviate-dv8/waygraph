// A failure inside a Block's act names its step, as a failed check does.
import { WaygraphError, messageOf } from "../errors.js";
import { TraitFailure } from "../trait/verify.js";

/**
 * An error from a Block's act (a click that timed out, a page object's own failure) with the step it came from in its
 * message, as a failed check says it: `act of "add-to-cart" failed: …`. The error itself is kept (a Playwright
 * TimeoutError stays one); one that already names its step (a check, waygraph's own, an inner step's) is left as it is.
 */
export function namingStep(err: unknown, block: string): unknown {
  if (!(err instanceof Error) || err instanceof WaygraphError || err instanceof TraitFailure) return err;
  if (err.message.includes('act of "') || err.message.includes('failed after "')) return err;
  Object.defineProperty(err, ACT_MESSAGE, { value: err.message, enumerable: false });
  err.message = `act of "${block}" failed: ${err.message}`;
  return err;
}

/** Where an act error keeps its own message (a symbol: src and dist can both name it). */
const ACT_MESSAGE = Symbol.for("waygraph.actMessage");

/** A step's error as the run log keeps it: its own message (the step is the event's own field), not the one naming it. */
export function stepMessageOf(err: unknown): string {
  return (err as { [ACT_MESSAGE]?: string } | null)?.[ACT_MESSAGE] ?? messageOf(err);
}
