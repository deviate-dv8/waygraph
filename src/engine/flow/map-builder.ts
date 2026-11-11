// map(): builds a Flow one step at a time - gotoPage / method / flow / branch - each checked for its Block kind; a step's
// expectations ride on it (`expect: [...]`).
import type { SomeBlock, SomeDefinedBlock } from "../block/some-block.js";
import { fastForwardSteps } from "../block/compose.js";
import type { MethodBlock } from "../block/kinds/method.js";
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
    MSG_MAP_METHOD_GOT_EXPECT,
    WaygraphError,
  MSG_MAP_NO_INPUT,
  MSG_MAP_STEPS_END,
} from "../errors.js";
import type { MemKey, MemPage } from "../mem/mem.js";
import type { Expected } from "../trait/trait.js";
import type { Flow, FlowSettings } from "./flow.js";
import type { Steps } from "./map-part.js";
import type { ExpectList } from "../block/kinds/expect.js";
import type { BrowserContext, Page } from "@playwright/test";
import type { RunGraphOptions } from "../run/run.js";
import type { EngineConfig } from "../config.js";
import { buildBranchedFlow } from "./map-branch.js";
import { signInStep } from "./account.js";
import { inWorld, restoreWorld, type World } from "./world.js";
import { asCleanup, settling, requiring, withoutRequire, settingInput, settingKey, stepExpect, skippable, assertMapKind, assertMapOrigin, assertMapSalt, landsOn, mapKindOf, MapStepOpts, paced, resetBefore, closingStep } from "./map-steps.js";
import type { MapFlowOpts } from "./map-options.js";
import { checkPanes, inPane, installPanes, type Pane } from "./panes.js";
import { paneOf } from "../run/pane-page.js";


/**
 * The one capability MapBuilder needs from Engine: turn the finished steps into a Flow with the engine's config. A
 * function, not the Engine class, so engine.ts and map-builder.ts don't import each other.
 */
export type BuildFlowFn = (steps: readonly SomeBlock[], settings: FlowSettings) => Flow<Checkpoint<string>>;

/** What a MapBuilder holds: its steps so far, an open fast-forward window, and the keys a `.set()` gave. */
interface BuilderState {
  // From Engine.map(): see BuildFlowFn.
  readonly build: BuildFlowFn;
  readonly settings: FlowSettings;
  readonly chain: readonly SomeBlock[];
  readonly homeOrigin: string | undefined;
  // `auto: true` = opened implicitly by a `{ ff: true }` step flag, not an explicit .ffStart() - closes silently at the
  // next non-flagged step (or where the flow ends, or at .branch()) instead of demanding a matching .ffEnd().
  readonly ff: { readonly name: string; readonly buffer: readonly SomeBlock[]; readonly auto: boolean } | null;
  readonly provided: readonly MemKey<unknown>[];
  /** The pane the next steps act in (`.in()`), in a flow with panes. */
  readonly pane?: string | undefined;
}

/** Where each pane of a flow is, by name: what `.in()` checks the steps after it against. */
export type PaneAt = { readonly [pane: string]: Checkpoint<string> };

/** `when` only on a step that stays on its Checkpoint: a skipped step ends where it started. */
export type WhenOpt<Out, NextOut> = [NextOut] extends [Out] ? { when?: (mem: MemPage) => boolean } : { when?: never };


/**
 * The flow builder behind `engine.map()` - see `map()`'s own doc
 * comment for why this exists. Each step method is scoped to exactly the
 * Block kind its name promises, checked at RUNTIME against the
 * `__waygraphKind`/`__waygraphSalt` markers `defineNavBlock`/`definePageBlock`/
 * `defineExpectBlock`/`defineMethodBlock` already set
 * (the same markers `graph.ts` and `map-check.ts` trust) - not just a type
 * hint, since a hand-rolled object can satisfy the TypeScript `Block<In,Out>`
 * shape without ever going through a real factory. Each call also
 * typechecks the accumulated Checkpoint chain (a step's `In` must equal the previous step's
 * `Out`) - this is what "no teleporting" means: there is no method on this
 * builder that can skip from one Checkpoint to an unrelated one without a
 * real, kind-correct Block in between.
 *
 * The chain is the flow: there is no closing call. A MapBuilder runs, lists its Blocks, nests (`.flow(sub)`) and
 * branches as a {@link Flow}, built from its steps the first time it's used that way.
 */
export class MapBuilder<
  Out extends Checkpoint<string>,
  Names extends string = never,
  P extends PaneAt = Record<never, never>,
  A extends string = never,
> implements Flow<Out> {
  // The Flow these steps make, built the first time it's used: the chain is immutable, so it is built once.
  private built: Flow<Out> | undefined;

  private constructor(private readonly at: BuilderState) {}

  /** @internal - use `engine.map()` or the standalone `map()` export. */
  static begin(build: BuildFlowFn, settings: FlowSettings, homeOrigin: string | undefined): MapBuilder<Start> {
    if (settings.panes) {
      checkPanes(settings.panes);
      installPanes();
      if (settings.as) throw new WaygraphError("WG_PANES", "map({ as, panes }): each pane says who is signed in there (panes: { name: { as } }), not the flow");
    }
    // A flow as an account starts signed in: its first step restores (or makes) that account's session.
    return new MapBuilder<Start>({ build, settings, chain: settings.as ? [signInStep(settings.as)] : [], homeOrigin, ff: null, provided: [] });
  }

  /** @internal - use `steps()` (map-part.ts). */
  static part<In extends Checkpoint<string>, Out extends Checkpoint<string>>(build: (m: MapBuilder<In>) => MapBuilder<Out>): Steps<In, Out> {
    const noFlow: BuildFlowFn = () => {
      throw new WaygraphError("WG_MAP_STEPS_END", MSG_MAP_STEPS_END);
    };
    const done = build(new MapBuilder<In>({ build: noFlow, settings: {}, chain: [], homeOrigin: undefined, ff: null, provided: [] })).closed();
    if (done.at.chain.length === 0) throw new WaygraphError("WG_MAP_EMPTY", MSG_MAP_EMPTY);
    return { blocks: done.at.chain, cleanup: done.at.settings.finally ?? [], provided: done.at.provided };
  }

  private next<Next extends Checkpoint<string>>(change: Partial<BuilderState>): MapBuilder<Next, Names, P, A> {
    return new MapBuilder<Next, Names, P, A>({ ...this.at, ...change });
  }

  /**
   * The steps after it act in `pane` (one of `map({ panes })`), until the next `.in()`: on that pane's page, from where
   * it last landed. Each pane keeps its own page, so a step is checked against where its pane is.
   * @example const Planner_ = pane("planner", { as: Planner }); const Admin_ = pane("admin", { as: Admin });
   *   engine.map({ panes: [Planner_, Admin_] })
   *   .in(Planner_).gotoPage(Registry.nav).method(Registry.do.requestRepair)
   *   .in(Admin_).gotoPage(Requests.nav).method(Requests.do.approve)
   */
  in<K extends Names>(given: Pane<K>): MapBuilder<K extends keyof P ? P[K] : Start, Names, Omit<P, A> & Record<A, Out>, K> {
    const panes = this.at.settings.panes;
    const pane = given.name;
    if (!panes?.[pane]) {
      throw new WaygraphError("WG_PANES", `.in(${pane}): ${panes ? `this flow's panes are ${Object.keys(panes).join(", ")}` : "this flow has no panes: declare them with map({ panes: [...] })"}`);
    }
    return new MapBuilder({ ...this.at, pane });
  }

  /**
   * Open a fast-forward window - steps until {@link ffEnd} collapse into one
   * opaque `fastForwardComposeBlock` (blitz theater). Kind/salt checks still
   * run on each inner step as it is added.
   */
  ffStart(name?: string): MapBuilder<Out, Names, P, A> {
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
  ffEnd(): MapBuilder<Out, Names, P, A> {
    if (!this.at.ff) {
      throw new WaygraphError("WG_MAP_FF_NOT_OPEN", MSG_MAP_FF_NOT_OPEN);
    }
    return this.closeFf();
  }

  /** Shared by the explicit {@link ffEnd} and the implicit close a `{ ff: true }` step flag triggers. */
  private closeFf(): MapBuilder<Out, Names, P, A> {
    const ff = this.at.ff;
    if (!ff) return this;
    if (ff.buffer.length === 0) {
      throw new WaygraphError("WG_MAP_FF_EMPTY", MSG_MAP_FF_EMPTY(ff.name));
    }
    // The window's steps were typechecked as they were added.
    return this.next({ chain: [...this.at.chain, fastForwardSteps(ff.name, ff.buffer)], ff: null });
  }

  /** The chain with an auto-opened `{ ff: true }` window closed; an explicit `.ffStart()` left open throws. */
  private closed(): MapBuilder<Out, Names, P, A> {
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
  private appendStep<NextOut extends Checkpoint<string>>(given: SomeBlock, ff?: boolean): MapBuilder<NextOut, Names, P, A> {
    const keyed = this.inItsPane(this.at.provided.reduce((b, key) => withoutRequire(b, key), given));
    // map({ expect: false }): every step's verify, none of its expectations.
    const block = this.at.settings.expect === false ? stepExpect(keyed, false) : keyed;
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
   * Closes another pane: its page (and its browser context, with every pane sharing it) goes, and the flow goes on in
   * the pane it's in; on a demo's stage the others take its room, from two side by side back to one screen. `.in()` it
   * again later and it opens afresh (signed in again).
   * @example .in(Admin_).method(Requests.do.approve).in(Planner_).close(Admin_).gotoPage(Registry.nav)
   */
  close<K extends Exclude<Names, A>>(given: Pane<K>): MapBuilder<Out, Names, Omit<P, K>, A> {
    const panes = this.at.settings.panes;
    const pane = given.name;
    if (!panes?.[pane]) {
      throw new WaygraphError("WG_PANES", `.close(${pane}): ${panes ? `this flow's panes are ${Object.keys(panes).join(", ")}` : "this flow has no panes"}`);
    }
    if (pane === this.at.pane) throw new WaygraphError("WG_PANES", `.close(${pane}): it's the pane the flow is in; .in() another first`);
    return this.appendStep<Out>(closingStep(pane));
  }

  /** In a flow with panes, the step plays in the pane `.in()` named (a sub-flow's steps that have their own stay there). */
  private inItsPane(block: SomeBlock): SomeBlock {
    const panes = this.at.settings.panes;
    if (!panes || paneOf(block)) return block;
    if (!this.at.pane) {
      throw new WaygraphError("WG_PANES", `${block.name}: this flow has panes (${Object.keys(panes).join(", ")}); say which one the step acts in with .in(pane) first`);
    }
    return inPane(block, this.at.pane, panes);
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
  ): MapBuilder<Lands, Names, P, A> {
    assertMapKind(block, ["nav", "page"], "gotoPage");
    assertMapOrigin(block, this.at.homeOrigin, "internal", "gotoPage");
    return this.appendStep(stepExpect(landsOn(settling(paced(block, opts), opts?.settle), opts?.lands), opts?.expect), opts?.ff);
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
  ): MapBuilder<Lands, Names, P, A> {
    assertMapKind(block, ["nav", "page"], "gotoExternal");
    assertMapOrigin(block, this.at.homeOrigin, "external", "gotoExternal");
    return this.appendStep(stepExpect(landsOn(settling(paced(block, opts), opts?.settle), opts?.lands), opts?.expect), opts?.ff);
  }

  /**
   * Appends a non-navigating page action (submit, upload, add/remove an
   * instance) - requires a Block from `defineMethodBlock` (or `defineApiBlock`).
   * Compile-time: {@link MethodBlock} only. Runtime also rejects an Expect Block (it carries
   * method salt from the factory internals): an expectation goes in a step's `expect: [...]`, not in a step of its own.
   * `{ ff: true }`: fast-forward this one step inline - see `appendStep`'s own comment.
   */
  method<NextOut extends Checkpoint<string>, Lands extends NextOut = NextOut>(
    block: MethodBlock<Out, NextOut> & { name: string },
    opts?: Omit<MapStepOpts<Lands>, "when"> & WhenOpt<Out, NextOut>,
  ): MapBuilder<Lands, Names, P, A> {
    if (mapKindOf(block) === "expect") {
      throw new WaygraphError("WG_MAP_WRONG_KIND", MSG_MAP_METHOD_GOT_EXPECT(block.name));
    }
    assertMapSalt(block, ["method", "api"], "method");
    return this.appendStep(skippable(stepExpect(landsOn(settling(paced(block, opts), opts?.settle), opts?.lands), opts?.expect), opts?.when), opts?.ff);
  }

  /**
   * Sets a mem key for the steps after it: a value, or one worked out from mem when the step runs. The next Block reads
   * it as it reads any key, so one Block covers the cases that differ only by what it is given; a key set here is no
   * longer one the run must supply.
   * @example .set(ShopKeys.search, (mem) => mem.get(ShopKeys.selectedItem).name).method(TypeSearchBlock)
   */
  set<T>(key: MemKey<T>, value: Expected<T>): MapBuilder<Out, Names, P, A> {
    const next = this.appendStep<Out>(settingKey(key, value));
    return next.next({ provided: [...next.at.provided.filter((k) => k !== key), key] });
  }

  /**
   * Plays a part made with {@link steps}: the same steps wherever a flow is on the part's Checkpoint. Typed like any
   * step - a part from another Checkpoint doesn't fit.
   * @example const addToCart = steps(Inventory, (m) => m.method(AddItemBlock, { expect: [ExpectBadgeBlock] })); map().gotoPage(NavInventoryBlock).steps(addToCart)
   */
  steps<NextOut extends Checkpoint<string>>(part: Steps<Out, NextOut>): MapBuilder<NextOut, Names, P, A> {
    let next = this.appendStep<NextOut>(part.blocks[0] as SomeBlock);
    for (const block of part.blocks.slice(1)) next = next.appendStep<NextOut>(block);
    next = next.next({ provided: [...new Set([...next.at.provided, ...part.provided])] });
    return part.cleanup.length ? next.withCleanup(part.cleanup) : next;
  }

  /**
   * Runs another flow's steps inline here, in the same page, browser and `mem`. This is how flows nest:
   * `map().flow(loginFlow).flow(viewerFlow, { reset: true })`. With `{ reset: true }` cookies and storage are cleared
   * right before the sub-flow's first step; `expect: [...]` is what this flow expects once the sub-flow is done (on its
   * last step).
   */
  flow<NextOut extends Checkpoint<string>>(sub: Flow<NextOut>, opts?: MapFlowOpts & { expect?: ExpectList<NextOut> }): MapBuilder<NextOut, Names, P, A> {
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
    const last = steps.length - 1;
    if (opts?.expect && last >= 0) steps[last] = stepExpect(steps[last] as SomeBlock, opts.expect);
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
   * @example engine.map().gotoPage(NavSignupBlock).method(SubmitSignupBlock).finally(DeleteTestUserApiBlock)
   */
  finally(block: SomeDefinedBlock): MapBuilder<Out, Names, P, A> {
    assertMapSalt(block, ["method", "api"], "finally");
    return this.withCleanup([asCleanup(block)]);
  }

  private withCleanup<Next extends Checkpoint<string>>(cleanup: readonly SomeBlock[]): MapBuilder<Next, Names, P, A> {
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
   *   ItemInCart: (m) => m.method(RemoveFromCartBlock),
   *   InventoryPage: (m) => m.method(AddToCartBlock),
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
    const before = this.finished();
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
   * The runnable Flow these steps make, with the settings given to `map({ … })`: built the first time the chain is used
   * as a flow (run, listed, nested, branched), then kept. Throws if no step was ever added, or an explicit `.ffStart()`
   * was left open; an auto-opened `{ ff: true }` window closes by itself.
   */
  private finished(): Flow<Out> {
    if (this.built) return this.built;
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
    this.built = build([first, ...rest], settings) as Flow<Out>;
    return this.built;
  }

  // The chain is the flow: each Flow member is the built flow's.
  get resetSession(): boolean {
    return this.finished().resetSession;
  }
  get config(): Flow<Out>["config"] {
    return this.finished().config;
  }
  get expectedFailureReason(): string | undefined {
    return this.finished().expectedFailureReason;
  }
  get demoPace(): Flow<Out>["demoPace"] {
    return this.finished().demoPace;
  }
  get highlightStyle(): Flow<Out>["highlightStyle"] {
    return this.finished().highlightStyle;
  }
  get memStub(): boolean | undefined {
    return this.finished().memStub;
  }
  get input(): Flow<Out>["input"] {
    return this.finished().input;
  }
  get device(): Flow<Out>["device"] {
    return this.finished().device;
  }
  get exclusive(): boolean | undefined {
    return this.finished().exclusive;
  }
  run(context: BrowserContext, mem: MemPage): Promise<Out>;
  run(context: BrowserContext, mem: MemPage, options: RunGraphOptions & { closeOnFinish: false }): Promise<{ result: Out; page: Page }>;
  run(context: BrowserContext, mem: MemPage, options?: RunGraphOptions): Promise<Out>;
  run(mem: MemPage, config?: EngineConfig): Promise<Out>;
  async run(...args: [BrowserContext | MemPage, (MemPage | EngineConfig)?, RunGraphOptions?]): Promise<unknown> {
    const run = this.finished().run as (...a: typeof args) => Promise<unknown>;
    return run(...args);
  }
  /** The flow's Blocks; none for a chain with no step yet (a base other flows extend). */
  blocks(): ReturnType<Flow<Out>["blocks"]> {
    return this.at.chain.length === 0 && !this.at.ff ? [] : this.finished().blocks();
  }
  withBlockVerify(...args: Parameters<Flow<Out>["withBlockVerify"]>): Flow<Out> {
    return this.finished().withBlockVerify(...args);
  }
  modBlockVerify(...args: Parameters<Flow<Out>["modBlockVerify"]>): Flow<Out> {
    return this.finished().modBlockVerify(...args);
  }
}
