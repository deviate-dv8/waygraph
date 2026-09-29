// Split out of engine-class.ts (which crammed Engine and MapBuilder into one file despite them
// being two unrelated concepts - see src/ARCHITECTURE.md). Behavior unchanged.
import type { Block, Checkpoint } from "../types.js";
import type { EngineConfig } from "./config.js";
import type { EndMarker, StartMarker } from "./run-graph.js";
import { buildFlow } from "./flow.js";
import type { Flow } from "./flow.js";
import { MapBuilder } from "./map-builder.js";
import type { DefineFlowFn, MapBuilderOptions } from "./map-builder.js";

type S = Checkpoint<"__start__">;

/**
 * Holds engine-level configuration shared across every flow defined from it -
 * for now, just how to launch a browser when a Flow owns its own
 * (`headless`/`browserName`/`slowMo`); traits/interstitials/watchers land here
 * in a later change.
 * @example const engine = new Engine({ headless: false, slowMo: 250 });
 */
export class Engine {
  constructor(private readonly config: EngineConfig = {}) {}

  /**
   * Builds a runnable {@link Flow} from `[start, ...Blocks, end]`, typechecked
   * so each Block's `In` must match the previous Block's `Out` - the same
   * check `connect()` does, just declared as a flat array instead of hand-nested
   * calls. Overloaded for 2-9 array slots (1-8 real Blocks between `start`/`end`)
   * rather than one fully-generic recursive tuple type, so each arity is as
   * reliably checked as `connect<A,B,C>` itself.
   * @example engine.defineFlow([start, LoginBlock, AddToCartBlock, end])
   */
  defineFlow<B extends Checkpoint<string>>(
    blocks: readonly [StartMarker, Block<S, B>, EndMarker],
  ): Flow<B>;
  defineFlow<B extends Checkpoint<string>, C extends Checkpoint<string>>(
    blocks: readonly [StartMarker, Block<S, B>, Block<B, C>, EndMarker],
  ): Flow<C>;
  defineFlow<B extends Checkpoint<string>, C extends Checkpoint<string>, D extends Checkpoint<string>>(
    blocks: readonly [StartMarker, Block<S, B>, Block<B, C>, Block<C, D>, EndMarker],
  ): Flow<D>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
  >(
    blocks: readonly [StartMarker, Block<S, B>, Block<B, C>, Block<C, D>, Block<D, E>, EndMarker],
  ): Flow<E>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      EndMarker,
    ],
  ): Flow<F>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      EndMarker,
    ],
  ): Flow<G>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      EndMarker,
    ],
  ): Flow<H>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
    I extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      Block<H, I>,
      EndMarker,
    ],
  ): Flow<I>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
    I extends Checkpoint<string>,
    J extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      Block<H, I>,
      Block<I, J>,
      EndMarker,
    ],
  ): Flow<J>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
    I extends Checkpoint<string>,
    J extends Checkpoint<string>,
    K extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      Block<H, I>,
      Block<I, J>,
      Block<J, K>,
      EndMarker,
    ],
  ): Flow<K>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
    I extends Checkpoint<string>,
    J extends Checkpoint<string>,
    K extends Checkpoint<string>,
    L extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      Block<H, I>,
      Block<I, J>,
      Block<J, K>,
      Block<K, L>,
      EndMarker,
    ],
  ): Flow<L>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
    I extends Checkpoint<string>,
    J extends Checkpoint<string>,
    K extends Checkpoint<string>,
    L extends Checkpoint<string>,
    M extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      Block<H, I>,
      Block<I, J>,
      Block<J, K>,
      Block<K, L>,
      Block<L, M>,
      EndMarker,
    ],
  ): Flow<M>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
    I extends Checkpoint<string>,
    J extends Checkpoint<string>,
    K extends Checkpoint<string>,
    L extends Checkpoint<string>,
    M extends Checkpoint<string>,
    N extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      Block<H, I>,
      Block<I, J>,
      Block<J, K>,
      Block<K, L>,
      Block<L, M>,
      Block<M, N>,
      EndMarker,
    ],
  ): Flow<N>;
  defineFlow<
    B extends Checkpoint<string>,
    C extends Checkpoint<string>,
    D extends Checkpoint<string>,
    E extends Checkpoint<string>,
    F extends Checkpoint<string>,
    G extends Checkpoint<string>,
    H extends Checkpoint<string>,
    I extends Checkpoint<string>,
    J extends Checkpoint<string>,
    K extends Checkpoint<string>,
    L extends Checkpoint<string>,
    M extends Checkpoint<string>,
    N extends Checkpoint<string>,
    O extends Checkpoint<string>,
  >(
    blocks: readonly [
      StartMarker,
      Block<S, B>,
      Block<B, C>,
      Block<C, D>,
      Block<D, E>,
      Block<E, F>,
      Block<F, G>,
      Block<G, H>,
      Block<H, I>,
      Block<I, J>,
      Block<J, K>,
      Block<K, L>,
      Block<L, M>,
      Block<M, N>,
      Block<N, O>,
      EndMarker,
    ],
  ): Flow<O>;
  defineFlow(blocks: readonly [StartMarker, ...Block<any, any>[], EndMarker]): Flow<any> {
    return buildFlow(blocks.slice(1, -1) as Block<any, any>[], this.config);
  }

  /**
   * Fluent, kind-checked alternative to `defineFlow([start, ...blocks, end])` -
   * see {@link MapBuilder}. Real, direct request this responds to: pia/zsign's
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
  map(options?: MapBuilderOptions): MapBuilder<S> {
    return MapBuilder.begin(this.defineFlow.bind(this) as DefineFlowFn, options?.homeOrigin);
  }
}

/**
 * Standalone convenience for `new Engine(config).map(options)` - use this
 * when a call site doesn't otherwise need its own `Engine` instance (no
 * shared `headless`/`slowMo`/`layouts` across several flows).
 * @example const flow = map({ homeOrigin: "https://app.example.com" }).gotoPage(NavHomeBlock).end();
 */
export function map(options?: MapBuilderOptions & EngineConfig): MapBuilder<S> {
  return new Engine(options).map(options);
}
