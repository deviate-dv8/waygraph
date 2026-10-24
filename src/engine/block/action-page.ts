// The page a regular Block's act() gets (navigation struck through), and a Block's live instance options.
import type { Page } from "@playwright/test";

/**
 * The `page` a regular Block's `act()` is typed against via `defineBlock` -
 * structurally identical to Playwright's own `Page` (the same real object is
 * passed at runtime; this is a type-only narrowing), except `goto`, `reload`,
 * `goBack`, and `goForward` are re-declared under `@deprecated`. Nothing is
 * blocked - every method is still fully present and callable, and this never
 * causes a build to fail - but a TypeScript-aware editor shows the call
 * struck through with a hover warning the instant it's typed, pointing at
 * `defineNavBlock` instead. `NavBlock`'s own generated `act()` (the one place
 * navigation actually belongs) uses the real `Page`, not this type - that
 * distinction lives entirely inside `defineNavBlock` and never reaches a
 * NavBlock's own author, who never writes its `act()` by hand.
 */

import type { MemKey } from "../mem/mem.js";

export type ActionPage = Omit<Page, "goto" | "reload" | "goBack" | "goForward"> & {
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  goto: Page["goto"];
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  reload: Page["reload"];
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  goBack: Page["goBack"];
  /** @deprecated Navigation doesn't belong in a regular Block's act() - use defineNavBlock instead. */
  goForward: Page["goForward"];
};
/**
 * One selectable option for a Block whose real choices depend on the live
 * page - "which of these items to add to cart" is only knowable by looking
 * at the DOM, not from static analysis. `waygraph auto` calls
 * {@link Block.instanceOptions} while building its menu and lists one row
 * per option (via `label`) instead of a single generic "block -> checkpoint"
 * row; picking a row does `mem.set(key, value)` before that Block's own
 * `act()` runs, so `act()` just reads mem exactly like any other required
 * key - it never needs to know whether it was driven by a human-authored
 * Flow or a dynamic auto-explore menu.
 * @example { id: "sauce-labs-backpack", label: 'Add "Sauce Labs Backpack" to cart', key: SelectedItem.key, value: { id: "sauce-labs-backpack", name: "Sauce Labs Backpack" } }
 */

export interface WaygraphInstanceOption<T = unknown> {
  /** Stable id for this option - used to dedupe menu rows across rebuilds. */
  id: string;
  /** Shown in the menu instead of a generic "block -> checkpoint" line. */
  label: string;
  /** Must be one of this Block's own `requires` keys. */
  key: MemKey<T>;
  /** `mem.set(key, value)` right before this Block's `act()` runs. */
  value: T;
  /**
   * Optional CSS selector for the element this option will act on.
   * `waygraph auto` (headful) rings that element while the menu row is hovered
   * so you can see what a pick would click before committing.
   */
  highlight?: string;
}
