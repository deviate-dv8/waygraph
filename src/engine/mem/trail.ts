// What each step of a run saw: the page's read after every step, in order, kept with the run's mem so a later step (a check
// on page 9, a stub, a Method) can ask what page 4 showed. Typed by the keys the pages already expose: `Cart.read.items`.
import type { ReadKey } from "../read/read-key.js";
import type { ReadPage } from "../read/read-page.js";

/** One look at a page: the step it followed, the Block, the page (Checkpoint), the pane in a split view, and what it showed. */
export interface Sighting {
  step: number;
  block: string;
  page: string;
  pane?: string;
  read: ReadPage;
}

/** A key's value as one step saw it. */
export interface Seen<T> {
  step: number;
  block: string;
  page: string;
  pane?: string;
  value: T;
}

/** Which looks to consider. */
export interface TrailFilter {
  /** Only what this pane saw (a flow with panes). */
  pane?: string;
}

/**
 * The reads of a run, oldest first. `latest(Cart.read.items)` is the newest value any step saw for the key; a step that
 * didn't show it (the page was another) doesn't count. Never throws for a key nobody saw: `undefined`, or an empty list.
 */
export class Trail {
  private readonly sightings: Sighting[] = [];

  /** Records what the page showed after `step`. The run does this; a pilot session does it for a step a person made. */
  add(sighting: Sighting): void {
    this.sightings.push(sighting);
  }

  /** How many looks there are. */
  get length(): number {
    return this.sightings.length;
  }

  /** Every look at `key`, oldest first, with the step that saw it. */
  all<T>(key: ReadKey<T>, filter: TrailFilter = {}): Seen<T>[] {
    return this.sightings
      .filter((s) => (filter.pane === undefined || s.pane === filter.pane) && s.read.has(key))
      .map(({ step, block, page, pane, read }) => ({ step, block, page, ...(pane ? { pane } : {}), value: read.get(key) }));
  }

  /** The newest value any step saw for `key`. @example mem.trail.latest(Cart.read.items) */
  latest<T>(key: ReadKey<T>, filter: TrailFilter = {}): T | undefined {
    return this.all(key, filter).at(-1)?.value;
  }

  /** The first value a step saw for `key` (how it started). */
  first<T>(key: ReadKey<T>, filter: TrailFilter = {}): T | undefined {
    return this.all(key, filter)[0]?.value;
  }

  /** What `key` showed right after step `step` (its index in the run log); undefined when that step didn't show it. */
  at<T>(step: number, key: ReadKey<T>): T | undefined {
    return this.all(key).find((s) => s.step === step)?.value;
  }

  /** How `key` changed between its last two sightings; undefined when it was seen fewer than twice. */
  changed<T>(key: ReadKey<T>, filter: TrailFilter = {}): { from: T; to: T } | undefined {
    const seen = this.all(key, filter);
    const [from, to] = seen.slice(-2);
    return from && to ? { from: from.value, to: to.value } : undefined;
  }
}
