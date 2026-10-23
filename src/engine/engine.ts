// Where authoring starts. Blocks (block/) are steps between Checkpoints (checkpoint/); `engine.map()` chains them into a
// Flow (flow/), checking each step's kind; `flow.run()` plays it Block by Block through runGraph (run/), with Playwright.
// An Engine carries the config every flow it builds shares: how to launch a browser, and the layouts to verify.
import type { Checkpoint } from "./checkpoint/checkpoint.js";
import type { EngineConfig } from "./config.js";
import { buildFlow, withSettings } from "./flow/flow.js";
import { MapBuilder } from "./flow/map-builder.js";
import type { MapBuilderOptions } from "./flow/map-builder.js";

/** Where every `map()` starts: before its first step. */
export type MapStart = Checkpoint<"__start__">;

/**
 * Holds engine-level configuration shared across every flow defined from it -
 * for now, just how to launch a browser when a Flow owns its own
 * (`headless`/`browserName`/`slowMo`); traits/interstitials/watchers land here
 * in a later change.
 * @example const engine = new Engine({ headless: false, slowMo: 250 });
 */
export class Engine {
  /** How flows from this engine launch their own browser, and the layouts every step is checked against. */
  constructor(readonly config: EngineConfig = {}) {}

  /**
   * Builds a flow, one kind-checked step at a time - see {@link MapBuilder}. Real, direct request this responds to: pia/zsign's
   * own agents kept hand-editing/hand-composing Blocks into ad hoc shapes
   * ("locks" convention tried, still got broken) - `map()` forces every step
   * through this Engine's own `define*Block` factories (checked by the same
   * `__waygraphKind`/`__waygraphSalt` runtime markers `graph.ts`/`map-check.ts`
   * already trust), so a hand-rolled plain-object Block can never silently
   * pass as a real navigation/assertion/method step. `homeOrigin`, if given,
   * also gates `.gotoPage()`/`.gotoExternal()` against each Nav/Page Block's
   * own static `url` (skipped, honestly, for click-based/dynamic nav - not
   * statically checkable, same limitation `map-check.ts` already documents).
   * @example
   * const flow = engine.map({ homeOrigin: "https://app.example.com" })
   *   .start()
   *   .gotoPage(NavHomeBlock)
   *   .assert(AssertHelloBlock)
   *   .gotoExternal(NavMailpitBlock)
   *   .end();
   */
  map(options?: MapBuilderOptions): MapBuilder<MapStart> {
    const { homeOrigin, ...settings } = options ?? {};
    return MapBuilder.begin((steps, flowSettings) => withSettings(buildFlow(steps, this.config), flowSettings), settings, homeOrigin);
  }
}

/**
 * Standalone convenience for `new Engine(config).map(options)` - use this
 * when a call site doesn't otherwise need its own `Engine` instance (no
 * shared `headless`/`slowMo`/`layouts` across several flows).
 * @example const flow = map({ homeOrigin: "https://app.example.com" }).gotoPage(NavHomeBlock).end();
 */
export function map(options?: MapBuilderOptions & EngineConfig): MapBuilder<MapStart> {
  return new Engine(options).map(options);
}
