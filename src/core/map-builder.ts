// Split out of engine-class.ts (which crammed Engine and MapBuilder into one file despite them
// being two unrelated concepts - see src/ARCHITECTURE.md). Behavior unchanged.
import type { Block, Checkpoint, DefinedBlock } from "../types.js";
import {
  WaygraphError,
  MSG_MAP_WRONG_KIND,
  MSG_MAP_WRONG_SALT,
  MSG_MAP_WRONG_ORIGIN_INTERNAL,
  MSG_MAP_WRONG_ORIGIN_EXTERNAL,
  MSG_MAP_BRANCH_SHARED_SESSION_UNSUPPORTED,
  MSG_MAP_FF_ALREADY_OPEN,
  MSG_MAP_FF_NOT_OPEN,
  MSG_MAP_FF_EMPTY,
  MSG_MAP_METHOD_GOT_ASSERT,
  MSG_MAP_BRANCH_NO_PRIOR_STEP,
  MSG_MAP_FF_NOT_CLOSED,
  MSG_MAP_EMPTY,
} from "../errors.js";
import type { EngineConfig } from "./config.js";
import { end, start } from "./run-graph.js";
import type { EndMarker, StartMarker } from "./run-graph.js";
import type { Flow } from "./flow.js";
import type { RunGraphOptions } from "./run-graph.js";
import { MemPage } from "../mem-page.js";
import type { BrowserContext, Page } from "@playwright/test";
import { fastForwardComposeBlock } from "./compose.js";
import type { NavBlock } from "./blocks/nav.js";
import type { PageBlock } from "./blocks/page.js";
import type { AssertBlock, MethodBlock } from "./blocks/method.js";
import type { EffectBlock } from "./blocks/effect.js";

type S = Checkpoint<"__start__">;

/**
 * The one capability MapBuilder needs from Engine - a plain defineFlow-shaped function, not the
 * whole Engine class. Depending on Engine-the-type here would make engine.ts and map-builder.ts
 * import each other (Engine.map() builds a MapBuilder; MapBuilder.end() calls back into
 * defineFlow) - a real cycle check:structure forbids. This type is how that's avoided.
 */
export type DefineFlowFn = (blocks: readonly [StartMarker, ...Block<any, any>[], EndMarker]) => Flow<any>;

/** Per-step options every `MapBuilder` step method (`.gotoPage()`/`.method()`/`.assert()`) takes. */
export interface MapStepOpts {
  /**
   * Fast-forward just this step, inline - no `.ffStart()/.ffEnd()` bracket needed. Consecutive
   * `{ ff: true }` steps merge into ONE fast-forward block, same result as the explicit bracket
   * form; a step without the flag closes an auto-opened window first.
   * @example map().gotoPage(NavLoginBlock, { ff: true }).method(FillUsernameBlock, { ff: true })
   */
  ff?: boolean;
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
  throw new WaygraphError("WG_MAP_WRONG_KIND", MSG_MAP_WRONG_KIND(method, block?.name ?? "?", wanted, found));
}


function assertMapSalt(block: Block<any, any>, allowed: readonly string[], method: string): void {
  const salt = mapSaltOf(block);
  if (salt !== undefined && allowed.includes(salt)) return;
  const wanted = allowed.map((s) => MAP_SALT_FACTORY_HINT[s] ?? s).join(" or ");
  const found = salt ? `a Block salted "${salt}"` : "an object with no waygraph salt marker at all";
  throw new WaygraphError("WG_MAP_WRONG_SALT", MSG_MAP_WRONG_SALT(method, block?.name ?? "?", wanted, found));
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
    throw new WaygraphError("WG_MAP_WRONG_ORIGIN", MSG_MAP_WRONG_ORIGIN_INTERNAL(block.name, targetOrigin, wantOrigin));
  }
  if (expect === "external" && !isExternal) {
    throw new WaygraphError("WG_MAP_WRONG_ORIGIN", MSG_MAP_WRONG_ORIGIN_EXTERNAL(block.name, targetOrigin, wantOrigin));
  }
}


/**
 * Builds the `Flow` object `MapBuilder.branch()` returns: run `before`, then dispatch on the
 * resolved tag into whichever `routes` entry matches (same page/context/mem), or return that
 * Checkpoint as-is when its route is `null`. Factored out so `withBlockVerify`/`modBlockVerify`
 * can patch `before` and rebuild the same branched shape, exactly like a plain Flow's own.
 */
function buildBranchedFlow<Out extends Checkpoint<string>>(
  before: Flow<Out>,
  routes: Record<string, Flow<any> | null>,
): Flow<any> {
  const run = (async (
    contextOrMem: BrowserContext | MemPage,
    memOrConfig?: MemPage | EngineConfig,
    options?: RunGraphOptions,
  ) => {
    if (contextOrMem instanceof MemPage) {
      throw new WaygraphError("WG_MAP_BRANCH_SHARED_SESSION_UNSUPPORTED", MSG_MAP_BRANCH_SHARED_SESSION_UNSUPPORTED);
    }
    const context = contextOrMem;
    const mem = memOrConfig as MemPage;
    const gotOwnPage = options?.page === undefined;
    const page = options?.page ?? (await context.newPage());
    const closeOnFinish = options?.closeOnFinish ?? gotOwnPage;
    const first = (await before.run(context, mem, { ...options, page, closeOnFinish: false })) as {
      result: Out;
      page: Page;
    };
    const branchFlow = routes[first.result.__state];
    if (!branchFlow) {
      if (options?.closeOnFinish === false) return { result: first.result, page: first.page };
      if (closeOnFinish) await first.page.close();
      return first.result;
    }
    return branchFlow.run(context, mem, { ...options, page: first.page, closeOnFinish });
  }) as Flow<any>["run"];
  return {
    resetSession: before.resetSession,
    ...(before.title !== undefined ? { title: before.title } : {}),
    ...(before.expectedFailureReason !== undefined ? { expectedFailureReason: before.expectedFailureReason } : {}),
    ...(before.highlightFixtures !== undefined ? { highlightFixtures: before.highlightFixtures } : {}),
    ...(before.demoPace !== undefined ? { demoPace: before.demoPace } : {}),
    ...(before.highlightStyle !== undefined ? { highlightStyle: before.highlightStyle } : {}),
    ...(before.memStub !== undefined ? { memStub: before.memStub } : {}),
    // Read by branchRoutes()/branchInfo() (branch-regression.ts) - real, ORDINARY (enumerable)
    // properties, not hidden ones, specifically so a `with*` wrapper's `{ ...flow, ... }` spread
    // (withSessionReset, withTitle, etc.) carries them through instead of silently dropping them -
    // the same class of bug branch()'s missing copyWaygraphRuntime call already was.
    __wgBranch: { before, routes },
    // Static introspection (`waygraph graph`/list): the fixed prefix, plus every branch's own
    // Blocks prefixed by the tag that leads to them - can't know at analysis time which one a real
    // run takes, so this shows all of them rather than none.
    blocks: () => [
      ...before.blocks(),
      ...Object.entries(routes).flatMap(([tag, f]) =>
        f ? f.blocks().map((b) => ({ ...b, name: `${tag} -> ${b.name}` })) : [],
      ),
    ],
    run,
    withBlockVerify(block, verify) {
      return buildBranchedFlow(before.withBlockVerify(block, verify), routes);
    },
    modBlockVerify(block, nameOrIndex, newCheck) {
      return buildBranchedFlow(before.modBlockVerify(block, nameOrIndex, newCheck), routes);
    },
  } as Flow<any>;
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
    // A plain defineFlow-shaped function, not the whole Engine - see DefineFlowFn's own comment.
    private readonly defineFlow: DefineFlowFn,
    private readonly steps: readonly DefinedBlock<any, any>[],
    private readonly homeOrigin: string | undefined,
    // `auto: true` = opened implicitly by a `{ ff: true }` step flag, not an explicit .ffStart() -
    // closes silently at the next non-flagged step (or at .end()/.branch()) instead of demanding a
    // matching .ffEnd(), since the author never opened anything they'd need to remember to close.
    private readonly ff:
      | { name: string; buffer: readonly DefinedBlock<any, any>[]; auto: boolean }
      | null = null,
  ) {}

  /** @internal - use `engine.map()` or the standalone `map()` export. */
  static begin(defineFlow: DefineFlowFn, homeOrigin: string | undefined): MapBuilder<S> {
    return new MapBuilder<S>(defineFlow, [], homeOrigin, null);
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
      throw new WaygraphError("WG_MAP_FF_ALREADY_OPEN", MSG_MAP_FF_ALREADY_OPEN(this.ff.name));
    }
    const ffName =
      typeof name === "string" && name.trim()
        ? name.trim()
        : `ff-${this.steps.length + 1}`;
    return new MapBuilder<Out>(this.defineFlow, this.steps, this.homeOrigin, {
      name: ffName,
      buffer: [],
      auto: false,
    });
  }

  /**
   * Close the current fast-forward window and append one FFCompose step.
   * Throws if empty or if {@link ffStart} was never opened.
   */
  ffEnd(): MapBuilder<Out> {
    if (!this.ff) {
      throw new WaygraphError("WG_MAP_FF_NOT_OPEN", MSG_MAP_FF_NOT_OPEN);
    }
    return this.closeFf();
  }

  /** Shared by the explicit {@link ffEnd} and the implicit close a `{ ff: true }` step flag triggers. */
  private closeFf(): MapBuilder<Out> {
    const ff = this.ff;
    if (!ff) return this;
    if (ff.buffer.length === 0) {
      throw new WaygraphError("WG_MAP_FF_EMPTY", MSG_MAP_FF_EMPTY(ff.name));
    }
    const composed = fastForwardComposeBlock(
      ff.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ff.buffer as any,
    );
    return new MapBuilder<Out>(
      this.defineFlow,
      [...this.steps, composed as unknown as DefinedBlock<any, any>],
      this.homeOrigin,
      null,
    );
  }

  /**
   * `ff`: inline fast-forward, no `.ffStart()/.ffEnd()` bracket needed - `.method(X, { ff: true })`
   * marks just that step; consecutive `{ ff: true }` steps merge into ONE fast-forward block (same
   * runtime result as the explicit bracket form), same as if they'd been wrapped in
   * `.ffStart()/.ffEnd()`. A step WITHOUT the flag closes an auto-opened window first, so a plain
   * step is never silently swept into one; an EXPLICIT `.ffStart()` window still behaves as before
   * (stays open until its own `.ffEnd()`, regardless of whether a step passed `{ ff: true }`).
   */
  private appendStep<NextOut extends Checkpoint<string>>(
    block: DefinedBlock<any, any>,
    ff?: boolean,
  ): MapBuilder<NextOut> {
    if (ff) {
      const win = this.ff ?? { name: `ff-${this.steps.length + 1}`, buffer: [], auto: true };
      return new MapBuilder<NextOut>(this.defineFlow, this.steps, this.homeOrigin, {
        name: win.name,
        buffer: [...win.buffer, block],
        auto: win.auto,
      });
    }
    if (this.ff && this.ff.auto) {
      return (this.closeFf() as unknown as MapBuilder<NextOut>).appendStep(block);
    }
    if (this.ff) {
      // Explicit .ffStart() window still open - absorbs a plain step too, same as always.
      return new MapBuilder<NextOut>(this.defineFlow, this.steps, this.homeOrigin, {
        name: this.ff.name,
        buffer: [...this.ff.buffer, block],
        auto: false,
      });
    }
    return new MapBuilder<NextOut>(
      this.defineFlow,
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
   * `{ ff: true }`: fast-forward this one step inline - see {@link appendStep}'s own comment.
   */
  gotoPage<NextOut extends Checkpoint<string>>(
    block: (NavBlock<NextOut> | PageBlock<NextOut>) & { name: string },
    opts?: MapStepOpts,
  ): MapBuilder<NextOut> {
    assertMapKind(block, ["nav", "page"], "gotoPage");
    assertMapOrigin(block, this.homeOrigin, "internal", "gotoPage");
    return this.appendStep(block as DefinedBlock<any, any>, opts?.ff);
  }

  /**
   * Appends a genuinely cross-origin navigation step (e.g. `(external)/`
   * Blocks in the Waygraph Map convention: mailpit, maildrop.cc) - same
   * kind requirement as {@link gotoPage}, plus the inverse `homeOrigin` check.
   * Compile-time: {@link NavBlock} or {@link PageBlock} only.
   * `{ ff: true }`: fast-forward this one step inline - see {@link appendStep}'s own comment.
   */
  gotoExternal<NextOut extends Checkpoint<string>>(
    block: (NavBlock<NextOut> | PageBlock<NextOut>) & { name: string },
    opts?: MapStepOpts,
  ): MapBuilder<NextOut> {
    assertMapKind(block, ["nav", "page"], "gotoExternal");
    assertMapOrigin(block, this.homeOrigin, "external", "gotoExternal");
    return this.appendStep(block as DefinedBlock<any, any>, opts?.ff);
  }

  /**
   * Appends a self-loop verification step - requires a Block from
   * `defineAssertBlock`. Compile-time: {@link AssertBlock} only (not `.method()`).
   * `{ ff: true }`: fast-forward this one step inline - see {@link appendStep}'s own comment.
   */
  assert(block: AssertBlock<Out> & { name: string }, opts?: MapStepOpts): MapBuilder<Out> {
    assertMapKind(block, ["assert"], "assert");
    return this.appendStep(block as DefinedBlock<any, any>, opts?.ff);
  }

  /**
   * Appends a non-navigating page action (submit, upload, add/remove an
   * instance) - requires a Block from `defineMethodBlock`/`defineActionBlock`/
   * `defineEffectBlock`/`defineMemEffectBlock`.
   * Compile-time: {@link MethodBlock} or {@link EffectBlock} only - Assert
   * Blocks must use `.assert()`. Runtime also rejects `__waygraphKind =
   * "assert"` (those still carry method salt from the factory internals).
   * `{ ff: true }`: fast-forward this one step inline - see {@link appendStep}'s own comment.
   */
  method<NextOut extends Checkpoint<string>>(
    block: (MethodBlock<Out, NextOut> | EffectBlock<Out, NextOut>) & { name: string },
    opts?: MapStepOpts,
  ): MapBuilder<NextOut> {
    if (mapKindOf(block) === "assert") {
      throw new WaygraphError("WG_MAP_WRONG_KIND", MSG_MAP_METHOD_GOT_ASSERT(block.name));
    }
    assertMapSalt(block, ["method", "effect"], "method");
    return this.appendStep(block as DefinedBlock<any, any>, opts?.ff);
  }

  /**
   * Branch: run everything added so far, then continue into whichever `routes[tag]` matches the
   * resolved Checkpoint's tag - same page, same context, same mem. `routes` must cover every tag
   * of `Out` (a missing one is a compile error, matching {@link branch}'s own exhaustiveness);
   * `null` means that tag is terminal (the branched Flow just returns that Checkpoint).
   *
   * Each non-null route is a function, not a ready-made `Flow` - a fresh Flow always starts at the
   * special `S` (start) Checkpoint, but a branch's blocks start from the TAG it routes on (e.g.
   * `LoggedIn`), so the function is handed a brand-new `MapBuilder` already seeded at that exact
   * Checkpoint to chain `.method()/.gotoPage()/.assert()/.end()` (or another `.branch()`) off of.
   *
   * Real gap this fixes: the plain `branch()` helper's `.next` routing is only ever consulted by
   * `runGraph`'s own graph walk - `defineFlow`/`.end()` compose steps pairwise via `connect()`,
   * which never looks at `.next` at all, so a Map-built Flow had no way to branch. This method
   * branches at the Flow level instead: it finalizes the prefix, runs it, and picks the next Flow
   * itself once the real tag is known - no engine-level routing involved.
   *
   * Only the `run(context, mem[, options])` signature is supported - the page must survive across
   * the branch, and the bare `run(mem, config)` convenience form always closes its own browser
   * before a tag is even known, so it throws instead of silently reopening a fresh (state-losing) page.
   *
   * The route's first Block still sees `input.__state === "__start__"` in `act()`, not the tag that
   * routed there - `runGraph` seeds every Flow's entry Block that way unconditionally, the same as
   * any standalone `defineFlow([start, block, end])` already does. Read `page`/`mem`, not `input`,
   * in `act()` - every real Block in this codebase already follows that convention.
   *
   * @example
   * map({ homeOrigin }).gotoPage(NavCartBlock).branch({
   *   ItemInCart: (m) => m.method(RemoveFromCartBlock).end(),
   *   LoggedIn: (m) => m.method(AddToCartBlock).end(),
   * });
   */
  branch<
    Routes extends {
      [K in Out["__state"]]: ((m: MapBuilder<Extract<Out, Checkpoint<K>>>) => Flow<any>) | null;
    },
  >(
    routes: Routes,
  ): Flow<
    {
      [K in keyof Routes & string]: Routes[K] extends (m: any) => Flow<infer R>
        ? R
        : Extract<Out, Checkpoint<K>>;
    }[keyof Routes & string]
  > {
    if (this.steps.length === 0) {
      throw new WaygraphError("WG_MAP_BRANCH_NO_PRIOR_STEP", MSG_MAP_BRANCH_NO_PRIOR_STEP);
    }
    const before = this.end();
    const resolvedRoutes: Record<string, Flow<any> | null> = {};
    for (const [tag, fn] of Object.entries(
      routes as Record<string, ((m: MapBuilder<any>) => Flow<any>) | null>,
    )) {
      resolvedRoutes[tag] = fn ? fn(new MapBuilder<any>(this.defineFlow, [], this.homeOrigin, null)) : null;
    }
    return buildBranchedFlow(before, resolvedRoutes) as never;
  }

  /**
   * Finalizes this chain into a real, runnable {@link Flow} - same object
   * `defineFlow` returns, so `withBlockVerify`/`modBlockVerify` and every
   * `withTitle`/`withHighlightFixtures`/etc. decorator still apply exactly
   * as they do today; this builder only changes how the chain is assembled,
   * never what it produces. Throws if no step was ever added - an empty map
   * isn't a flow. An auto-opened `{ ff: true }` window (see {@link MapStepOpts})
   * left open at `.end()` closes silently; an EXPLICIT `.ffStart()` left open
   * still throws - the author opened that one and needs to close it themselves.
   */
  end(): Flow<Out> {
    if (this.ff && !this.ff.auto) {
      throw new WaygraphError("WG_MAP_FF_NOT_CLOSED", MSG_MAP_FF_NOT_CLOSED(this.ff.name));
    }
    if (this.ff && this.ff.auto) {
      return this.closeFf().end();
    }
    if (this.steps.length === 0) {
      throw new WaygraphError("WG_MAP_EMPTY", MSG_MAP_EMPTY);
    }
    const chain = [start, ...this.steps, end] as unknown as readonly [
      StartMarker,
      Block<any, any>,
      EndMarker,
    ];
    return (this.defineFlow as (blocks: unknown) => Flow<Out>)(chain);
  }
}
