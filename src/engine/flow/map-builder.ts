// map(): builds a Flow one step at a time - gotoPage / method / assert / flow / branch - each checked for its Block kind.
import type { SomeBlock, SomeDefinedBlock } from "../block/block.js";
import { fastForwardComposeBlock } from "../block/compose.js";
import type { EffectBlock } from "../block/kinds/effect.js";
import type { AssertBlock, MethodBlock } from "../block/kinds/method.js";
import type { NavBlock } from "../block/kinds/nav.js";
import type { PageBlock } from "../block/kinds/page.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import {
    MSG_MAP_BRANCH_NO_PRIOR_STEP,
    MSG_MAP_EMPTY,
    MSG_MAP_FF_ALREADY_OPEN,
    MSG_MAP_FF_EMPTY,
    MSG_MAP_FF_NOT_CLOSED,
    MSG_MAP_FF_NOT_OPEN,
    MSG_MAP_METHOD_GOT_ASSERT,
    WaygraphError,
  MSG_MAP_NO_INPUT,
} from "../errors.js";
import type { MemKey, MemPage } from "../mem/mem.js";
import type { DemoPace } from "../stub/pace.js";
import type { HighlightStyleDefaults } from "../stub/ring.js";
import type { Flow, FlowSettings } from "./flow.js";
import { buildBranchedFlow } from "./map-branch.js";
import { signInStep, type Account } from "./account.js";
import { inWorld, restoreWorld, type World } from "./world.js";
import { asCleanup, settling, requiring, withoutRequire, settingInput, skippable, assertMapKind, assertMapOrigin, assertMapSalt, landsOn, mapKindOf, MapStepOpts, paced, resetBefore } from "./map-steps.js";

type S = Checkpoint<"__start__">;

/**
 * The one capability MapBuilder needs from Engine: turn the finished steps into a Flow with the engine's config. A
 * function, not the Engine class, so engine.ts and map-builder.ts don't import each other.
 */
export type BuildFlowFn = (steps: readonly SomeBlock[], settings: FlowSettings) => Flow<Checkpoint<string>>;

/** Flow-level settings for `engine.map({ … })`: `memStub`, `sessionReset`, `expectedFailure`, `demoPace`, `highlightStyle`, `homeOrigin`. */
export interface MapBuilderOptions {
  /**
   * This project's own origin (e.g. `"https://app.example.com"`) - enables
   * `.gotoPage()`/`.gotoExternal()`'s origin check against a Block's static
   * `url`. Omit to skip that check entirely (still fully kind-checked either
   * way; only the internal/external origin distinction is opt-in).
   */
  homeOrigin?: string;
  /** Fill missing `requires` keys from `registerMemStub` when the flow runs. */
  memStub?: boolean;
  /**
   * This flow wants a fresh browser session (cookies and storage cleared) when it runs after another one, in a CLI chain
   * (`waygraph run "a then b"`) or nested with `.flow(sub)`: a second user signing in, a logged-out check.
   */
  sessionReset?: boolean;
  /** Marks a flow that is supposed to throw, with the reason shown in the demo. */
  expectedFailure?: string;
  /** Default demo pace for the whole flow. */
  demoPace?: DemoPace;
  /** Default ring tone, size and weight for the whole flow. */
  highlightStyle?: HighlightStyleDefaults;
  /**
   * Run as this account (`account(name, { signIn })`): the flow starts signed in, from the session kept since the
   * account's first sign-in in this process, or by signing in now.
   * @example engine.map({ as: Planner }).gotoPage(NavEquipmentBlock)
   */
  as?: Account;
  /**
   * The MemKey this flow takes as its input: one flow for many cases. Its first step requires it; `waygraph run
   * <flow> --input <json | @file>` gives it (an array plays the flow once per item), as do `--data`, a mem stub and
   * `.flow(sub, { input })`.
   * @example engine.map({ input: ApiCase }).gotoExternal(NavHoppscotchRestBlock).method(LoadCaseBlock)…
   */
  input?: MemKey<unknown>;
  /**
   * The browser size this flow plays at: a responsive layout, a page that needs room. `run` and `demo` resize to it when
   * the flow starts; `waygraph test --flows` runs it at that size.
   * @example engine.map({ viewport: { width: 1600, height: 900 } })
   */
  viewport?: { width: number; height: number };
  /**
   * Under `waygraph test --flows`, run this flow alone, after every other flow: it changes data others read (a bulk
   * delete, a settings change), or it needs the app to itself.
   */
  exclusive?: boolean;
  /**
   * The time zone the flow runs in (an IANA name): the page's clock and dates follow it; put back when the flow ends.
   * Chromium.
   * @example engine.map({ timezone: "Asia/Tokyo" })
   */
  timezone?: string;
  /**
   * The network the flow runs on: `throttle` (`"offline"`, `"slow-3g"`, `"fast-3g"`, or latency and throughput;
   * Chromium) and `faults` (requests that fail or are slow on purpose). Applied when the flow starts, put back when it
   * ends, pass or fail.
   * @example engine.map({ network: { faults: [{ url: "**\/api/orders", status: 500 }] } })
   */
  network?: World["network"];
}

/** What `.flow()` takes for the sub-flow it runs inline. */
export interface MapFlowOpts {
  /** Clear cookies and storage right before the sub-flow, e.g. to start a second user fresh. Defaults to the sub-flow's own `sessionReset`. */
  reset?: boolean;
  /** The sub-flow's input (it declares `map({ input })`): set right before its first step. */
  input?: unknown;
}

/** `when` only on a step that stays on its Checkpoint: a skipped step ends where it started. */
type WhenOpt<Out, NextOut> = [NextOut] extends [Out] ? { when?: (mem: MemPage) => boolean } : { when?: never };


/**
 * The flow builder behind `engine.map()` - see `map()`'s own doc
 * comment for why this exists. Each step method is scoped to exactly the
 * Block kind its name promises, checked at RUNTIME against the
 * `__waygraphKind`/`__waygraphSalt` markers `defineNavBlock`/`definePageBlock`/
 * `defineAssertBlock`/`defineMethodBlock`/`defineEffectBlock` already set
 * (the same markers `graph.ts` and `map-check.ts` trust) - not just a type
 * hint, since a hand-rolled object can satisfy the TypeScript `Block<In,Out>`
 * shape without ever going through a real factory. Each call also
 * typechecks the accumulated Checkpoint chain (a step's `In` must equal the previous step's
 * `Out`) - this is what "no teleporting" means: there is no method on this
 * builder that can skip from one Checkpoint to an unrelated one without a
 * real, kind-correct Block in between.
 */
export class MapBuilder<Out extends Checkpoint<string>> {
  private constructor(
    // From Engine.map(): see BuildFlowFn.
    private readonly build: BuildFlowFn,
    private readonly settings: FlowSettings,
    private readonly steps: readonly SomeDefinedBlock[],
    private readonly homeOrigin: string | undefined,
    // `auto: true` = opened implicitly by a `{ ff: true }` step flag, not an explicit .ffStart() -
    // closes silently at the next non-flagged step (or at .end()/.branch()) instead of demanding a
    // matching .ffEnd(), since the author never opened anything they'd need to remember to close.
    private readonly ff:
      | { name: string; buffer: readonly SomeDefinedBlock[]; auto: boolean }
      | null = null,
  ) {}

  /** @internal - use `engine.map()` or the standalone `map()` export. */
  static begin(build: BuildFlowFn, settings: FlowSettings, homeOrigin: string | undefined): MapBuilder<S> {
    // A flow as an account starts signed in: its first step restores (or makes) that account's session.
    return new MapBuilder<S>(build, settings, settings.as ? [signInStep(settings.as)] : [], homeOrigin, null);
  }

  /** Readable chain-opener. Returns `this` unchanged; entirely optional. */
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
    return new MapBuilder<Out>(this.build, this.settings, this.steps, this.homeOrigin, {
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
      // The window's steps were typechecked as they were added; the one-step overload takes them as one Block.
      ff.buffer as readonly [SomeDefinedBlock],
    );
    return new MapBuilder<Out>(
      this.build,
      this.settings,
      [...this.steps, composed as unknown as SomeDefinedBlock],
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
    block: SomeDefinedBlock,
    ff?: boolean,
  ): MapBuilder<NextOut> {
    if (ff) {
      const win = this.ff ?? { name: `ff-${this.steps.length + 1}`, buffer: [], auto: true };
      return new MapBuilder<NextOut>(this.build, this.settings, this.steps, this.homeOrigin, {
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
      return new MapBuilder<NextOut>(this.build, this.settings, this.steps, this.homeOrigin, {
        name: this.ff.name,
        buffer: [...this.ff.buffer, block],
        auto: false,
      });
    }
    return new MapBuilder<NextOut>(
      this.build,
      this.settings,
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
   * `{ ff: true }`: fast-forward this one step inline - see `appendStep`'s own comment.
   */
  gotoPage<NextOut extends Checkpoint<string>, Lands extends NextOut = NextOut>(
    block: (NavBlock<NextOut> | PageBlock<NextOut>) & { name: string },
    opts?: MapStepOpts<Lands>,
  ): MapBuilder<Lands> {
    assertMapKind(block, ["nav", "page"], "gotoPage");
    assertMapOrigin(block, this.homeOrigin, "internal", "gotoPage");
    return this.appendStep(landsOn(settling(paced(block, opts), opts?.settle), opts?.lands), opts?.ff);
  }

  /**
   * Appends a genuinely cross-origin navigation step (e.g. `(external)/`
   * Blocks in the Waygraph Map convention: mailpit, maildrop.cc) - same
   * kind requirement as {@link gotoPage}, plus the inverse `homeOrigin` check.
   * Compile-time: {@link NavBlock} or {@link PageBlock} only.
   * `{ ff: true }`: fast-forward this one step inline - see `appendStep`'s own comment.
   */
  gotoExternal<NextOut extends Checkpoint<string>, Lands extends NextOut = NextOut>(
    block: (NavBlock<NextOut> | PageBlock<NextOut>) & { name: string },
    opts?: MapStepOpts<Lands>,
  ): MapBuilder<Lands> {
    assertMapKind(block, ["nav", "page"], "gotoExternal");
    assertMapOrigin(block, this.homeOrigin, "external", "gotoExternal");
    return this.appendStep(landsOn(settling(paced(block, opts), opts?.settle), opts?.lands), opts?.ff);
  }

  /**
   * Appends a self-loop verification step - requires a Block from
   * `defineAssertBlock`. Compile-time: {@link AssertBlock} only (not `.method()`).
   * `{ ff: true }`: fast-forward this one step inline - see `appendStep`'s own comment.
   */
  assert(block: AssertBlock<Out> & { name: string }, opts?: Omit<MapStepOpts, "lands">): MapBuilder<Out> {
    assertMapKind(block, ["assert"], "assert");
    return this.appendStep(skippable(settling(paced(block, opts), opts?.settle), opts?.when), opts?.ff);
  }

  /**
   * Appends a non-navigating page action (submit, upload, add/remove an
   * instance) - requires a Block from `defineMethodBlock`/`defineActionBlock`/
   * `defineEffectBlock`/`defineMemEffectBlock`.
   * Compile-time: {@link MethodBlock} or {@link EffectBlock} only - Assert
   * Blocks must use `.assert()`. Runtime also rejects `__waygraphKind =
   * "assert"` (those still carry method salt from the factory internals).
   * `{ ff: true }`: fast-forward this one step inline - see `appendStep`'s own comment.
   */
  method<NextOut extends Checkpoint<string>, Lands extends NextOut = NextOut>(
    block: (MethodBlock<Out, NextOut> | EffectBlock<Out, NextOut>) & { name: string },
    opts?: Omit<MapStepOpts<Lands>, "when"> & WhenOpt<Out, NextOut>,
  ): MapBuilder<Lands> {
    if (mapKindOf(block) === "assert") {
      throw new WaygraphError("WG_MAP_WRONG_KIND", MSG_MAP_METHOD_GOT_ASSERT(block.name));
    }
    assertMapSalt(block, ["method", "effect", "api"], "method");
    return this.appendStep(skippable(landsOn(settling(paced(block, opts), opts?.settle), opts?.lands), opts?.when), opts?.ff);
  }

  /**
   * Runs another flow's steps inline here, in the same page, browser and `mem`. This is how flows nest:
   * `map().flow(loginFlow).flow(viewerFlow, { reset: true })`. With `{ reset: true }` cookies and storage are cleared
   * right before the sub-flow's first step.
   */
  flow<NextOut extends Checkpoint<string>>(sub: Flow<NextOut>, opts?: MapFlowOpts): MapBuilder<NextOut> {
    // The steps' types live in `sub`; at runtime this is one untyped walk, typed again as the sub-flow's last Checkpoint.
    let next = this as unknown as MapBuilder<any>;
    if (opts && "input" in opts) {
      if (!sub.input) throw new WaygraphError("WG_MAP_NO_INPUT", MSG_MAP_NO_INPUT(sub.blocks()[0]?.name ?? "?"));
      next = next.appendStep(settingInput(sub.input, opts.input, sub.blocks()[0]?.name ?? "flow"));
    }
    const infos = sub.blocks();
    infos.filter((info) => !info.cleanup).forEach((info, i) => {
      let block = i === 0 && (opts?.reset ?? sub.resetSession) ? resetBefore(info.block) : info.block;
      // Given here, the input is no longer something the run must supply.
      if (i === 0 && sub.input && opts && "input" in opts) block = withoutRequire(block as SomeDefinedBlock, sub.input);
      next = next.appendStep(block as SomeDefinedBlock);
    });
    // The sub-flow's cleanup runs with this flow's, at the end.
    const cleanup = infos.filter((info) => info.cleanup).map((info) => info.block);
    if (cleanup.length) next = new MapBuilder(next.build, { ...next.settings, finally: [...(next.settings.finally ?? []), ...cleanup] }, next.steps, next.homeOrigin, next.ff);
    return next as MapBuilder<NextOut>;
  }

  /**
   * A cleanup step: it runs after the flow's steps, whether they passed or failed, and its own failure is reported
   * without failing the flow - deleting what the flow created, usually with an API Block. Several run in the order
   * given. Doesn't move the flow: the next step still starts where the last one landed.
   * @example engine.map().gotoPage(NavSignupBlock).method(SubmitSignupBlock).finally(DeleteTestUserApiBlock).end()
   */
  finally(block: SomeDefinedBlock): MapBuilder<Out> {
    assertMapSalt(block, ["method", "effect", "api"], "finally");
    return new MapBuilder<Out>(this.build, { ...this.settings, finally: [...(this.settings.finally ?? []), asCleanup(block)] }, this.steps, this.homeOrigin, this.ff);
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
   * `runGraph`'s own graph walk - `.end()` composes steps pairwise via `connect()`,
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
   * any single-Block Flow does. Read `page`/`mem`, not `input`,
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
      [K in Out["__state"]]: ((m: MapBuilder<Extract<Out, Checkpoint<K>>>) => Flow<Checkpoint<string>>) | null;
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
    const resolvedRoutes: Record<string, Flow<Checkpoint<string>> | null> = {};
    for (const [tag, fn] of Object.entries(
      routes as Record<string, ((m: MapBuilder<Checkpoint<string>>) => Flow<Checkpoint<string>>) | null>,
    )) {
      // A branch is its own flow: the cleanup stays with the steps before it, not with every branch.
      const { finally: _cleanup, ...settings } = this.settings;
      resolvedRoutes[tag] = fn ? fn(new MapBuilder<Checkpoint<string>>(this.build, settings, [], this.homeOrigin, null)) : null;
    }
    return buildBranchedFlow(before, resolvedRoutes) as never;
  }

  /**
   * Finalizes this chain into a runnable {@link Flow} with the settings given to `map({ ... })`;
   * `withBlockVerify`/`modBlockVerify` work on it. Throws if no step was ever added - an empty map
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
    // The input is required by the first step, so preflight, --data, mem stubs and replay all cover it.
    let first = this.settings.input ? requiring(this.steps[0]!, this.settings.input) : this.steps[0]!;
    let settings = this.settings;
    // The flow's world (time zone, network) is set by its first step and put back by a cleanup step, pass or fail.
    const world: World = { ...(settings.timezone ? { timezone: settings.timezone } : {}), ...(settings.network ? { network: settings.network } : {}) };
    if (world.timezone || world.network) {
      first = inWorld(first, world);
      settings = { ...settings, finally: [...(settings.finally ?? []), asCleanup(restoreWorld(world))] };
    }
    return this.build([first, ...this.steps.slice(1)], settings) as Flow<Out>;
  }
}
