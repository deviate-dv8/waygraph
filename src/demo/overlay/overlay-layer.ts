// The overlay's pieces on one page, and what each last showed. A full page load (a link, a redirect, an external site)
// wipes everything waygraph painted; the overlay base comes back (installOverlay), and then every piece registered here
// paints itself again from its last value. So a piece of overlay UI survives navigation by registering here, once,
// instead of by code of its own in each surface's repaint.
//
//   stored pieces  remember what they were set to (the banner, the caption, the outcome card): `set` paints and remembers,
//                  `set(undefined)` takes it away and forgets it.
//   live pieces    repaint from state their owner already keeps (the stepper's todo docks and device).
import type { Page } from "@playwright/test";
import { ignorePageGone } from "../../engine/page-gone.js";

/** A piece of overlay UI that can paint itself again after a page load. */
export interface OverlayPiece {
  readonly name: string;
  repaint(page: Page): Promise<unknown>;
}

/** A piece that remembers its last value: what `set` painted is what a page load paints again. */
export class StoredPiece<T> implements OverlayPiece {
  private value: T | undefined;

  constructor(
    readonly name: string,
    private readonly paint: (page: Page, value: T) => Promise<unknown>,
    private readonly erase: (page: Page) => Promise<unknown>,
  ) {}

  /** What it shows now, if anything. */
  get current(): T | undefined {
    return this.value;
  }

  /** Paints `value` and remembers it; `undefined` takes the piece away and forgets it. */
  async set(page: Page, value: T | undefined): Promise<void> {
    this.value = value;
    await (value === undefined ? this.erase(page) : this.paint(page, value)).catch(ignorePageGone);
  }

  /** Changes what a page load paints, without painting now: for a piece its owner paints in steps (a card ticking in). */
  remember(value: T | undefined): void {
    this.value = value;
  }

  async repaint(page: Page): Promise<void> {
    if (this.value !== undefined) await this.paint(page, this.value).catch(ignorePageGone);
  }
}

/** A piece whose state lives with its owner: it repaints from whatever that state is when the page loads. */
export class LivePiece implements OverlayPiece {
  constructor(
    readonly name: string,
    private readonly paint: (page: Page) => Promise<unknown>,
  ) {}

  async repaint(page: Page): Promise<void> {
    await this.paint(page).catch(ignorePageGone);
  }
}

/** Every piece on one page, in the order they were registered (the order they repaint in). */
export class OverlayLayer {
  private readonly pieces = new Map<string, OverlayPiece>();

  /** Registers a piece; a later piece with the same name replaces it (a new demo on the same page). */
  register<P extends OverlayPiece>(piece: P): P {
    this.pieces.set(piece.name, piece);
    return piece;
  }

  /** The stored piece called `name`, registered the first time it's asked for. */
  stored<T>(name: string, paint: (page: Page, value: T) => Promise<unknown>, erase: (page: Page) => Promise<unknown>): StoredPiece<T> {
    const had = this.pieces.get(name);
    // One name is one piece: the code that registers a name always registers it with the same value type.
    if (had instanceof StoredPiece) return had as StoredPiece<T>;
    return this.register(new StoredPiece<T>(name, paint, erase));
  }

  /** Forgets every piece (the surface that painted them is done with the page). */
  clear(): void {
    this.pieces.clear();
  }

  /** Paints every piece again, from what each last showed (after the overlay base is back on a new page). */
  async repaint(page: Page): Promise<void> {
    for (const piece of this.pieces.values()) await piece.repaint(page);
  }
}

/** Each page's layer. On globalThis: src and dist, or two installs, can drive one page. */
const layers: WeakMap<Page, OverlayLayer> = ((globalThis as { [k: symbol]: WeakMap<Page, OverlayLayer> | undefined })[
  Symbol.for("waygraph.overlayLayers")
] ??= new WeakMap());

/** The page's overlay layer. */
export function overlayLayer(page: Page): OverlayLayer {
  let layer = layers.get(page);
  if (!layer) {
    layer = new OverlayLayer();
    layers.set(page, layer);
  }
  return layer;
}
