// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { Block, Checkpoint, DefinedBlock } from "../types.js";
import type { EngineConfig } from "./config.js";
import { end, start } from "./run-graph.js";
import type { EndMarker, StartMarker } from "./run-graph.js";
import { buildFlow } from "./flow.js";
import type { Flow } from "./flow.js";
import { fastForwardComposeBlock } from "./compose.js";
import type { NavBlock } from "./blocks/nav.js";
import type { PageBlock } from "./blocks/page.js";
import type { AssertBlock, MethodBlock } from "./blocks/method.js";
import type { EffectBlock } from "./blocks/effect.js";

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
    return MapBuilder.begin(this, options?.homeOrigin);
  }
}


export interface MapBuilderOptions {
  /**
   * This project's own origin (e.g. `"https://app.example.com"`) - enables
   * `.gotoPage()`/`.gotoExternal()`'s origin check against a Block's static
   * `url`. Omit to skip that check entirely (still fully kind-checked either
   * way; only the internal/external origin distinction is opt-in).
   */
  homeOrigin?: string;
}


function mapKindOf(block: unknown): string | undefined {
  return (block as { __waygraphKind?: string } | null | undefined)?.__waygraphKind;
}


function mapSaltOf(block: unknown): string | undefined {
  return (block as { __waygraphSalt?: string } | null | undefined)?.__waygraphSalt;
}


function mapNavUrlOf(block: unknown): string | undefined {
  const url = (block as { __waygraphNavUrl?: unknown } | null | undefined)?.__waygraphNavUrl;
  return typeof url === "string" ? url : undefined;
}


const MAP_KIND_FACTORY_HINT: Record<string, string> = {
  nav: "defineNavBlock/defineMemNavBlock",
  page: "definePageBlock",
  assert: "defineAssertBlock",
};

const MAP_SALT_FACTORY_HINT: Record<string, string> = {
  method: "defineMethodBlock",
  effect: "defineEffectBlock",
};


function assertMapKind(block: Block<any, any>, allowed: readonly string[], method: string): void {
  const kind = mapKindOf(block);
  if (kind !== undefined && allowed.includes(kind)) return;
  const wanted = allowed.map((k) => MAP_KIND_FACTORY_HINT[k] ?? k).join(" or ");
  const found = kind ? `a Block of kind "${kind}"` : "an object with no waygraph kind marker at all";
  throw new Error(
    `Waygraph map: .${method}("${block?.name ?? "?"}") requires a Block built with ${wanted} ` +
      `(found ${found} - a hand-built plain object doesn't count). This check is the whole point ` +
      "of the map() builder: only real Blocks from waygraph's own factories can enter a chain.",
  );
}


function assertMapSalt(block: Block<any, any>, allowed: readonly string[], method: string): void {
  const salt = mapSaltOf(block);
  if (salt !== undefined && allowed.includes(salt)) return;
  const wanted = allowed.map((s) => MAP_SALT_FACTORY_HINT[s] ?? s).join(" or ");
  const found = salt ? `a Block salted "${salt}"` : "an object with no waygraph salt marker at all";
  throw new Error(
    `Waygraph map: .${method}("${block?.name ?? "?"}") requires a Block built with ${wanted} ` +
      `(found ${found} - a hand-built plain object doesn't count). This check is the whole point ` +
      "of the map() builder: only real Blocks from waygraph's own factories can enter a chain.",
  );
}


function assertMapOrigin(
  block: Block<any, any>,
  homeOrigin: string | undefined,
  expect: "internal" | "external",
  method: string,
): void {
  if (!homeOrigin) return; // not configured - can't validate, honest no-op
  const navUrl = mapNavUrlOf(block);
  if (navUrl === undefined) return; // click-based/dynamic nav - not statically checkable
  let targetOrigin: string;
  let wantOrigin: string;
  try {
    targetOrigin = new URL(navUrl, homeOrigin).origin;
    wantOrigin = new URL(homeOrigin).origin;
  } catch {
    return; // malformed URL - not this check's job to validate that
  }
  const isExternal = targetOrigin !== wantOrigin;
  if (expect === "internal" && isExternal) {
    throw new Error(
      `Waygraph map: .gotoPage("${block.name}") targets ${targetOrigin}, which is NOT this map's ` +
        `home origin (${wantOrigin}) - use .gotoExternal() for a genuinely cross-origin destination.`,
    );
  }
  if (expect === "external" && !isExternal) {
    throw new Error(
      `Waygraph map: .gotoExternal("${block.name}") targets ${targetOrigin}, which IS this map's ` +
        `home origin (${wantOrigin}) - use .gotoPage() for an internal destination.`,
    );
  }
}


/**
 * Fluent builder over {@link Engine.defineFlow} - see `map()`'s own doc
 * comment for why this exists. Each step method is scoped to exactly the
 * Block kind its name promises, checked at RUNTIME against the
 * `__waygraphKind`/`__waygraphSalt` markers `defineNavBlock`/`definePageBlock`/
 * `defineAssertBlock`/`defineMethodBlock`/`defineEffectBlock` already set
 * (the same markers `graph.ts` and `map-check.ts` trust) - not just a type
 * hint, since a hand-rolled object can satisfy the TypeScript `Block<In,Out>`
 * shape without ever going through a real factory. Each call also
 * typechecks the accumulated Checkpoint chain exactly like `defineFlow`'s
 * own tuple overloads do (a step's `In` must equal the previous step's
 * `Out`) - this is what "no teleporting" means: there is no method on this
 * builder that can skip from one Checkpoint to an unrelated one without a
 * real, kind-correct Block in between.
 */
export class MapBuilder<Out extends Checkpoint<string>> {
  private constructor(
    private readonly engine: Engine,
    private readonly steps: readonly DefinedBlock<any, any>[],
    private readonly homeOrigin: string | undefined,
    private readonly ff:
      | { name: string; buffer: readonly DefinedBlock<any, any>[] }
      | null = null,
  ) {}

  /** @internal - use `engine.map()` or the standalone `map()` export. */
  static begin(engine: Engine, homeOrigin: string | undefined): MapBuilder<S> {
    return new MapBuilder<S>(engine, [], homeOrigin, null);
  }

  /** Readable chain-opener - mirrors `defineFlow`'s leading `start` sentinel. Returns `this` unchanged; entirely optional. */
  start(): MapBuilder<Out> {
    return this;
  }

  /**
   * Open a fast-forward window - steps until {@link ffEnd} collapse into one
   * opaque `fastForwardComposeBlock` (blitz theater). Kind/salt checks still
   * run on each inner step as it is added.
   */
  ffStart(name?: string): MapBuilder<Out> {
    if (this.ff) {
      throw new Error(
        `Waygraph map: .ffStart() while already inside "${this.ff.name}" - call .ffEnd() first`,
      );
    }
    const ffName =
      typeof name === "string" && name.trim()
        ? name.trim()
        : `ff-${this.steps.length + 1}`;
    return new MapBuilder<Out>(this.engine, this.steps, this.homeOrigin, {
      name: ffName,
      buffer: [],
    });
  }

  /**
   * Close the current fast-forward window and append one FFCompose step.
   * Throws if empty or if {@link ffStart} was never opened.
   */
  ffEnd(): MapBuilder<Out> {
    if (!this.ff) {
      throw new Error("Waygraph map: .ffEnd() with no open .ffStart()");
    }
    if (this.ff.buffer.length === 0) {
      throw new Error(
        `Waygraph map: .ffEnd() for "${this.ff.name}" has no steps - add .gotoPage/.method/… inside the window`,
      );
    }
    const composed = fastForwardComposeBlock(
      this.ff.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ff.buffer as any,
    );
    return new MapBuilder<Out>(
      this.engine,
      [...this.steps, composed as unknown as DefinedBlock<any, any>],
      this.homeOrigin,
      null,
    );
  }

  private appendStep<NextOut extends Checkpoint<string>>(
    block: DefinedBlock<any, any>,
  ): MapBuilder<NextOut> {
    if (this.ff) {
      return new MapBuilder<NextOut>(this.engine, this.steps, this.homeOrigin, {
        name: this.ff.name,
        buffer: [...this.ff.buffer, block],
      });
    }
    return new MapBuilder<NextOut>(
      this.engine,
      [...this.steps, block],
      this.homeOrigin,
      null,
    );
  }

  /**
   * Appends an internal navigation/page-arrival step - requires a Block from
   * `defineNavBlock`/`defineMemNavBlock`/`definePageBlock`. Throws if given
   * anything else, including a `homeOrigin`-mismatched static `url`.
   * Compile-time: {@link NavBlock} or {@link PageBlock} only (not Assert/Method).
   */
  gotoPage<NextOut extends Checkpoint<string>>(
    block: (NavBlock<NextOut> | PageBlock<NextOut>) & { name: string },
  ): MapBuilder<NextOut> {
    assertMapKind(block, ["nav", "page"], "gotoPage");
    assertMapOrigin(block, this.homeOrigin, "internal", "gotoPage");
    return this.appendStep(block as DefinedBlock<any, any>);
  }

  /**
   * Appends a genuinely cross-origin navigation step (e.g. `(external)/`
   * Blocks in the Waygraph Map convention: mailpit, maildrop.cc) - same
   * kind requirement as {@link gotoPage}, plus the inverse `homeOrigin` check.
   * Compile-time: {@link NavBlock} or {@link PageBlock} only.
   */
  gotoExternal<NextOut extends Checkpoint<string>>(
    block: (NavBlock<NextOut> | PageBlock<NextOut>) & { name: string },
  ): MapBuilder<NextOut> {
    assertMapKind(block, ["nav", "page"], "gotoExternal");
    assertMapOrigin(block, this.homeOrigin, "external", "gotoExternal");
    return this.appendStep(block as DefinedBlock<any, any>);
  }

  /**
   * Appends a self-loop verification step - requires a Block from
   * `defineAssertBlock`. Compile-time: {@link AssertBlock} only (not `.method()`).
   */
  assert(block: AssertBlock<Out> & { name: string }): MapBuilder<Out> {
    assertMapKind(block, ["assert"], "assert");
    return this.appendStep(block as DefinedBlock<any, any>);
  }

  /**
   * Appends a non-navigating page action (submit, upload, add/remove an
   * instance) - requires a Block from `defineMethodBlock`/`defineActionBlock`/
   * `defineEffectBlock`/`defineMemEffectBlock`.
   * Compile-time: {@link MethodBlock} or {@link EffectBlock} only - Assert
   * Blocks must use `.assert()`. Runtime also rejects `__waygraphKind =
   * "assert"` (those still carry method salt from the factory internals).
   */
  method<NextOut extends Checkpoint<string>>(
    block: (MethodBlock<Out, NextOut> | EffectBlock<Out, NextOut>) & { name: string },
  ): MapBuilder<NextOut> {
    if (mapKindOf(block) === "assert") {
      throw new Error(
        `Waygraph map: .method("${block.name}") got a defineAssertBlock - use .assert() for ` +
          "self-loop verify steps (Assert Blocks share method salt internally but are not methods).",
      );
    }
    assertMapSalt(block, ["method", "effect"], "method");
    return this.appendStep(block as DefinedBlock<any, any>);
  }

  /**
   * Finalizes this chain into a real, runnable {@link Flow} - same object
   * `defineFlow` returns, so `withBlockVerify`/`modBlockVerify` and every
   * `withTitle`/`withHighlightFixtures`/etc. decorator still apply exactly
   * as they do today; this builder only changes how the chain is assembled,
   * never what it produces. Throws if no step was ever added - an empty map
   * isn't a flow.
   */
  end(): Flow<Out> {
    if (this.ff) {
      throw new Error(
        `Waygraph map: .end() while .ffStart("${this.ff.name}") is still open - call .ffEnd() first`,
      );
    }
    if (this.steps.length === 0) {
      throw new Error(
        "Waygraph map: .end() called with zero steps - add at least one .gotoPage()/.gotoExternal()/" +
          ".assert()/.method() before .end()",
      );
    }
    const chain = [start, ...this.steps, end] as unknown as readonly [
      StartMarker,
      Block<any, any>,
      EndMarker,
    ];
    return (this.engine.defineFlow as (blocks: unknown) => Flow<Out>)(chain);
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
