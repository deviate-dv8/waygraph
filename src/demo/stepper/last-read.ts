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

/** The read the step before showed: what this step's changes are measured against. */
let shown: Record<string, unknown> | undefined;

/** One value the page shows that changed since the step before, both sides short enough for a card. */
export interface ReadChange {
  key: string;
  from: string;
  to: string;
}

/**
 * What the page shows that changed since the step before (by key path, in read order), and remembers this step's read
 * for the next. The first step with a read has nothing to compare with: no changes.
 */
export function takeReadChanges(): ReadChange[] {
  const now = lastRead();
  const before = shown;
  shown = now;
  if (!now || !before) return [];
  const was = flatten(before);
  return (
    Object.entries(flatten(now))
      .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(was[key]))
      .map(([key, value]) => ({ key, from: short(was[key]), to: short(value) }))
      // A list whose rows changed but not its size reads "3 items -> 3 items": nothing a card can say.
      .filter((change) => change.from !== change.to)
  );
}

/** `{ cart: { count: 1 } }` as `{ "cart.count": 1 }`: the read's namespaces and their fields. */
function flatten(read: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(read).flatMap(([ns, fields]) =>
      fields !== null && typeof fields === "object" && !Array.isArray(fields)
        ? Object.entries(fields as Record<string, unknown>).map(([field, value]) => [`${ns}.${field}`, value])
        : [[ns, fields]],
    ),
  );
}

/** A value as a card shows it: a list by its size, anything long cut short. */
function short(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}
