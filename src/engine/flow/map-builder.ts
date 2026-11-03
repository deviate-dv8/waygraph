// map(): builds a Flow one step at a time - gotoPage / method / assert / flow / branch - each checked for its Block kind.
import type { SomeBlock, SomeDefinedBlock } from "../block/some-block.js";
import { fastForwardSteps } from "../block/compose.js";
import type { EffectBlock } from "../block/kinds/effect.js";
import type { AssertBlock, MethodBlock } from "../block/kinds/method.js";
import type { NavBlock } from "../block/kinds/nav.js";
import type { PageBlock } from "../block/kinds/page.js";
import type { Checkpoint, Start } from "../checkpoint/checkpoint.js";
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
  MSG_MAP_STEPS_END,
} from "../errors.js";
import type { MemKey, MemPage } from "../mem/mem.js";
import type { ReadKey } from "../read/read-key.js";
import type { Expected } from "../trait/trait.js";
import type { DemoPace } from "../stub/pace.js";
import type { HighlightStyleDefaults } from "../stub/ring.js";
import type { Flow, FlowSettings } from "./flow.js";
import { buildBranchedFlow } from "./map-branch.js";
import { signInStep, type Account } from "./account.js";
import { inWorld, restoreWorld, type World } from "./world.js";
import { asCleanup, settling, requiring, withoutRequire, settingInput, settingKey, expecting, skippable, assertMapKind, assertMapOrigin, assertMapSalt, landsOn, mapKindOf, MapStepOpts, paced, resetBefore } from "./map-steps.js";


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
   * The MemKey this flow takes as its input: one flow for many cases. Its first step requires it; `--input`
   * (JSON or `@file`) gives it on the command line - an array plays the flow once per item - as do `--data`, a mem stub
   * and `.flow(sub, { input })`.
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

/** What a MapBuilder holds: its steps so far, an open fast-forward window, and the keys a `.set()` gave. */
interface BuilderState {
  // From Engine.map(): see BuildFlowFn.
  readonly build: BuildFlowFn;
  readonly settings: FlowSettings;
  readonly chain: readonly SomeBlock[];
  readonly homeOrigin: string | undefined;
  // `auto: true` = opened implicitly by a `{ ff: true }` step flag, not an explicit .ffStart() - closes silently at the
  // next non-flagged step (or at .end()/.branch()) instead of demanding a matching .ffEnd().
  readonly ff: { readonly name: string; readonly buffer: readonly SomeBlock[]; readonly auto: boolean } | null;
  readonly provided: readonly MemKey<unknown>[];
}

/**
 * Steps a flow plays as one part, from Checkpoint `In` to `Out`: made with {@link steps}, played with
 * `MapBuilder.steps()`.
 */
export interface Steps<In extends Checkpoint<string>, Out extends Checkpoint<string>> {
  /** Type-only: the Checkpoint the part starts on (a parameter, so only a flow on `In` takes it). Never set. */
  readonly __in?: (at: In) => void;
  /** Type-only: where the part ends. Never set. */
  readonly __out?: Out;
  readonly blocks: readonly SomeBlock[];
  readonly cleanup: readonly SomeBlock[];
  readonly provided: readonly MemKey<unknown>[];
}

/**
 * A part of a flow, written once and played by several (`.steps(part)`): the steps after `from`, as a flow writes them.
 * `from` is the Checkpoint the part starts on; the part is checked step by step, as a flow is.
 * @example
 * export const logDisruption = steps(DisruptionLog, (m) => m.method(SelectMachineBlock).method(FillShiftStartBlock).method(SubmitDisruptionBlock));
 * map({ as: Planner }).gotoPage(NavDisruptionLogBlock).steps(logDisruption).gotoPage(NavDisruptionLogBlock).steps(logDisruption)
 */
export function steps<In extends Checkpoint<string>, Out extends Checkpoint<string>>(_from: In, build: (m: MapBuilder<In>) => MapBuilder<Out>): Steps<In, Out> {
  return MapBuilder.part(build);
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
  private constructor(private readonly at: BuilderState) {}

  /** @internal - use `engine.map()` or the standalone `map()` export. */
  static begin(build: BuildFlowFn, settings: FlowSettings, homeOrigin: string | undefined): MapBuilder<Start> {
    // A flow as an account starts signed in: its first step restores (or makes) that account's session.
    return new MapBuilder<Start>({ build, settings, chain: settings.as ? [signInStep(settings.as)] : [], homeOrigin, ff: null, provided: [] });
  }

  /** @internal - use {@link steps}. */
  static part<In extends Checkpoint<string>, Out extends Checkpoint<string>>(build: (m: MapBuilder<In>) => MapBuilder<Out>): Steps<In, Out> {
    const noFlow: BuildFlowFn = () => {
      throw new WaygraphError("WG_MAP_STEPS_END", MSG_MAP_STEPS_END);
    };
    const done = build(new MapBuilder<In>({ build: noFlow, settings: {}, chain: [], homeOrigin: undefined, ff: null, provided: [] })).closed();
    if (done.at.chain.length === 0) throw new WaygraphError("WG_MAP_EMPTY", MSG_MAP_EMPTY);
    return { blocks: done.at.chain, cleanup: done.at.settings.finally ?? [], provided: done.at.provided };
  }

  private next<Next extends Checkpoint<string>>(change: Partial<BuilderState>): MapBuilder<Next> {
    return new MapBuilder<Next>({ ...this.at, ...change });
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
    if (this.at.ff) {
      throw new WaygraphError("WG_MAP_FF_ALREADY_OPEN", MSG_MAP_FF_ALREADY_OPEN(this.at.ff.name));
    }
    const ffName = typeof name === "string" && name.trim() ? name.trim() : `ff-${this.at.chain.length + 1}`;
    return this.next({ ff: { name: ffName, buffer: [], auto: false } });
  }

  /**
   * Close the current fast-forward window and append one FFCompose step.
   * Throws if empty or if {@link ffStart} was never opened.
   */
  ffEnd(): MapBuilder<Out> {
    if (!this.at.ff) {
      throw new WaygraphError("WG_MAP_FF_NOT_OPEN", MSG_MAP_FF_NOT_OPEN);
    }
    return this.closeFf();
  }

  /** Shared by the explicit {@link ffEnd} and the implicit close a `{ ff: true }` step flag triggers. */
  private closeFf(): MapBuilder<Out> {
    const ff = this.at.ff;
    if (!ff) return this;
    if (ff.buffer.length === 0) {
      throw new WaygraphError("WG_MAP_FF_EMPTY", MSG_MAP_FF_EMPTY(ff.name));
    }
    // The window's steps were typechecked as they were added.
    return this.next({ chain: [...this.at.chain, fastForwardSteps(ff.name, ff.buffer)], ff: null });
  }

  /** The chain with an auto-opened `{ ff: true }` window closed; an explicit `.ffStart()` left open throws. */
  private closed(): MapBuilder<Out> {
    if (this.at.ff && !this.at.ff.auto) {
      throw new WaygraphError("WG_MAP_FF_NOT_CLOSED", MSG_MAP_FF_NOT_CLOSED(this.at.ff.name));
    }
    return this.closeFf();
  }

  /**
   * `ff`: inline fast-forward, no `.ffStart()/.ffEnd()` bracket needed - `.method(X, { ff: true })`
   * marks just that step; consecutive `{ ff: true }` steps merge into ONE fast-forward block (same
   * runtime result as the explicit bracket form), same as if they'd been wrapped in
   * `.ffStart()/.ffEnd()`. A step WITHOUT the flag closes an auto-opened window first, so a plain
   * step is never silently swept into one; an EXPLICIT `.ffStart()` window still behaves as before
   * (stays open until its own `.ffEnd()`, regardless of whether a step passed `{ ff: true }`).
   * A key an earlier `.set()` gave is no longer one this step requires from the run.
   */
  private appendStep<NextOut extends Checkpoint<string>>(given: SomeBlock, ff?: boolean): MapBuilder<NextOut> {
    const block = this.at.provided.reduce((b, key) => withoutRequire(b, key), given);
    const ffWin = this.at.ff;
    if (ff) {
      const win = ffWin ?? { name: `ff-${this.at.chain.length + 1}`, buffer: [], auto: true };
      return this.next({ ff: { ...win, buffer: [...win.buffer, block] } });
    }
    if (ffWin?.auto) return this.closeFf().appendStep<NextOut>(block);
    // An explicit .ffStart() window still open absorbs a plain step too.
    if (ffWin) return this.next({ ff: { ...ffWin, buffer: [...ffWin.buffer, block] } });
    return this.next({ chain: [...this.at.chain, block] });
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
    assertMapOrigin(block, this.at.homeOrigin, "internal", "gotoPage");
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
    assertMapOrigin(block, this.at.homeOrigin, "external", "gotoExternal");
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
   * Sets a mem key for the steps after it: a value, or one worked out from mem when the step runs. The next Block reads
   * it as it reads any key, so one Block covers the cases that differ only by what it is given; a key set here is no
   * longer one the run must supply.
   * @example .set(ShopKeys.search, (mem) => mem.get(ShopKeys.selectedItem).name).method(TypeSearchBlock)
   */
  set<T>(key: MemKey<T>, value: Expected<T>): MapBuilder<Out> {
    const next = this.appendStep<Out>(settingKey(key, value));
    return next.next({ provided: [...next.at.provided.filter((k) => k !== key), key] });
  }

  /**
   * Checks what the page shows for a Read key, right here in the flow: equal to `want`, or passing it (`want` also gets
   * mem, to compare with what the flow did). Retried until the page settles, like every check. No Assert Block to write
   * for each value.
   * @example .expect(Order.status, "Paid") · .expect(Catalog.items, (items) => items.length === 6, "6 products")
   */
  expect<T>(key: ReadKey<T>, want: T | ((value: T, mem: MemPage) => boolean), wants?: string): MapBuilder<Out> {
    return this.appendStep(expecting(key, want, wants));
  }

  /**
   * Plays a part made with {@link steps}: the same steps wherever a flow is on the part's Checkpoint. Typed like any
   * step - a part from another Checkpoint doesn't fit.
   * @example const addToCart = steps(Inventory, (m) => m.method(AddItemBlock).assert(AssertBadgeBlock)); map().gotoPage(NavInventoryBlock).steps(addToCart)
   */
  steps<NextOut extends Checkpoint<string>>(part: Steps<Out, NextOut>): MapBuilder<NextOut> {
    let next = this.appendStep<NextOut>(part.blocks[0] as SomeBlock);
    for (const block of part.blocks.slice(1)) next = next.appendStep<NextOut>(block);
    next = next.next({ provided: [...new Set([...next.at.provided, ...part.provided])] });
    return part.cleanup.length ? next.withCleanup(part.cleanup) : next;
  }

  /**
   * Runs another flow's steps inline here, in the same page, browser and `mem`. This is how flows nest:
   * `map().flow(loginFlow).flow(viewerFlow, { reset: true })`. With `{ reset: true }` cookies and storage are cleared
   * right before the sub-flow's first step.
   */
  flow<NextOut extends Checkpoint<string>>(sub: Flow<NextOut>, opts?: MapFlowOpts): MapBuilder<NextOut> {
    // `sub` was checked step by step when it was built, so its steps play here as they are, ending on its NextOut.
    const steps: SomeBlock[] = [];
    if (opts && "input" in opts) {
      if (!sub.input) throw new WaygraphError("WG_MAP_NO_INPUT", MSG_MAP_NO_INPUT(sub.blocks()[0]?.name ?? "?"));
      steps.push(settingInput(sub.input, opts.input, sub.blocks()[0]?.name ?? "flow"));
    }
    const infos = sub.blocks();
    infos.filter((info) => !info.cleanup).forEach((info, i) => {
      // Given here, the input is no longer something the run must supply.
      steps.push(i === 0 && sub.input && opts && "input" in opts ? withoutRequire(info.block, sub.input) : info.block);
    });
    const [head, ...rest] = steps;
    // A flow can't be built without a step (WG_MAP_EMPTY), so a sub-flow always has one.
    if (!head) throw new WaygraphError("WG_MAP_EMPTY", MSG_MAP_EMPTY);
    // The reset comes before the whole sub-flow, its input step included.
    const first = (opts?.reset ?? sub.resetSession) ? resetBefore(head) : head;
    let next = this.appendStep<NextOut>(first);
    for (const block of rest) next = next.appendStep<NextOut>(block);
    // The sub-flow's cleanup runs with this flow's, at the end.
    const cleanup = infos.filter((info) => info.cleanup).map((info) => info.block);
    return cleanup.length ? next.withCleanup(cleanup) : next;
  }

  /**
   * A cleanup step: it runs after the flow's steps, whether they passed or failed, and its own failure is reported
   * without failing the flow - deleting what the flow created, usually with an API Block. Several run in the order
   * given. Doesn't move the flow: the next step still starts where the last one landed.
   * @example engine.map().gotoPage(NavSignupBlock).method(SubmitSignupBlock).finally(DeleteTestUserApiBlock).end()
   */
  finally(block: SomeDefinedBlock): MapBuilder<Out> {
    assertMapSalt(block, ["method", "effect", "api"], "finally");
    return this.withCleanup([asCleanup(block)]);
  }

  private withCleanup<Next extends Checkpoint<string>>(cleanup: readonly SomeBlock[]): MapBuilder<Next> {
    return this.next({ settings: { ...this.at.settings, finally: [...(this.at.settings.finally ?? []), ...cleanup] } });
  }

  /**
   * Branch: run everything added so far, then continue into whichever `routes[tag]` matches the Checkpoint it landed
   * on - same page, context and mem. `routes` must cover every tag of `Out` (a missing one is a compile error); `null`
   * ends the flow on that tag. Each route is a function handed a builder already on that tag's Checkpoint.
   *
   * Runs only as `run(context, mem[, options])`: the page must survive across the branch, and `run(mem, config)` closes
   * its own browser first. A route's first Block still sees `input.__state === "__start__"` in `act()`: read `page` and
   * `mem`, not `input`.
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
      [K in keyof Routes & string]: Routes[K] extends (m: never) => Flow<infer R>
        ? R
        : Extract<Out, Checkpoint<K>>;
    }[keyof Routes & string]
  > {
    if (this.at.chain.length === 0) {
      throw new WaygraphError("WG_MAP_BRANCH_NO_PRIOR_STEP", MSG_MAP_BRANCH_NO_PRIOR_STEP);
    }
    const before = this.end();
    const resolvedRoutes: Record<string, Flow<Checkpoint<string>> | null> = {};
    for (const [tag, fn] of Object.entries(
      routes as Record<string, ((m: MapBuilder<Checkpoint<string>>) => Flow<Checkpoint<string>>) | null>,
    )) {
      // A branch is its own flow: the cleanup stays with the steps before it, not with every branch.
      const { finally: _cleanup, ...settings } = this.at.settings;
      resolvedRoutes[tag] = fn ? fn(new MapBuilder<Checkpoint<string>>({ ...this.at, settings, chain: [], ff: null })) : null;
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
    const { chain, settings: given, build } = this.closed().at;
    const [firstStep, ...rest] = chain;
    if (!firstStep) {
      throw new WaygraphError("WG_MAP_EMPTY", MSG_MAP_EMPTY);
    }
    // The input is required by the first step, so preflight, --data, mem stubs and replay all cover it.
    let first = given.input ? requiring(firstStep, given.input) : firstStep;
    let settings = given;
    // The flow's world (time zone, network) is set by its first step and put back by a cleanup step, pass or fail.
    const world: World = { ...(settings.timezone ? { timezone: settings.timezone } : {}), ...(settings.network ? { network: settings.network } : {}) };
    if (world.timezone || world.network) {
      first = inWorld(first, world);
      settings = { ...settings, finally: [...(settings.finally ?? []), asCleanup(restoreWorld(world))] };
    }
    // map() checked each step against the last one, so the flow ends on Out.
    return build([first, ...rest], settings) as Flow<Out>;
  }
}
