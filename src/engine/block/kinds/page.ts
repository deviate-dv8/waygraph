// A Page Block: "you have arrived" - the hub other pages navigate to, verified by what the page shows.
import { defineNavigating } from "./nav.js";
import { defineMethodBlock, type MethodBlock } from "./method.js";
import { defineExpectBlock, type ExpectBlock, type ExpectBlockOptions } from "./expect.js";
import type { Page } from "@playwright/test";
import type { Account } from "../../flow/account.js";
import { markFor } from "../access.js";
import { mark } from "../mark.js";
import type { Block, DefinedBlock, StepScreenshot } from "../block.js";
import { screenshotPage } from "../../run/screenshot.js";
import { checkpoint as makeCheckpoint, type Checkpoint } from "../../checkpoint/checkpoint.js";
import type { Trait } from "../../trait/trait.js";
import { MemPage } from "../../mem/mem.js";
import type { MemKey } from "../../mem/mem.js";
import { addressFromFolder, type CpOfLands, type InlineLink, type LandsOn, type PageFolderGo, type PageGo, type PageLinks, type PageName } from "./page-parts.js";
import { registerFrame } from "../../run/frame.js";
import { defineLayout, layoutState } from "./layout.js";
import { markRoute } from "../../checkpoint/route.js";
import type { SomeDefinedBlock } from "../some-block.js";
import type { NavBlock } from "./nav.js";
import type { ExpectList } from "./expect.js";
import { defineReadBlock, type ReadBlock } from "../../read/read-block.js";
import type { ReadCtx } from "../../read/readers.js";
import { namespaceOf, readKeys, type PageRead, type PageReadKeys } from "../../read/read-keys.js";

/** One Block (or lazy factory) registered on a {@link PageBlock}. */
export type PageMethodEntry =
  | SomeDefinedBlock
  | (() => SomeDefinedBlock)
  /** A Method with params (`self.method((from, to) => ({ ... }))`): called with real values where a flow uses it. */
  | ((...args: never[]) => SomeDefinedBlock);

/** Options for `definePageBlock`: the Checkpoint a page hub confirms and the Methods that hang off it. */
/**
 * One Expect Block (or lazy factory) a {@link PageBlock} names. Typed loosely here: an expectation often judges the
 * state an action on the page leads to (an item in the cart), and each entry keeps its own exact type in `expects`, so
 * a step's `expect` still checks it against where the step lands.
 */
export type PageExpectEntry = PageMethodEntry | Trait;

/**
 * What `do` and `expects` are given: the page itself, as far as it's defined: its read keys, to build checks from
 * (`page.read.modalOpen.is(true)`), and its nav.
 */
/** A Method written inside its page's `do`: the page is its `from` and, unless `to` says otherwise, its `to`. */
export interface InlineMethod<Out extends Checkpoint<string>, L extends Checkpoint<string>> {
  /** Its name in run logs and the manifest; by default the page's and the key (`login-fill-email`). */
  name?: string;
  description?: string;
  /** Where it lands, when it isn't the page it's on: a page's name, so no import of it is needed. Several: `lands` says which. */
  to?: LandsOn | readonly LandsOn[];
  /** Mem keys it needs set before it runs. */
  requires?: readonly MemKey<unknown>[];
  /** Who has it (its button shows for them). */
  for?: readonly Account[];
  precondition?: Trait[] | ((input: Out) => Trait[]);
  act(page: Page, input: Out, mem: MemPage): Promise<void>;
  verify?: Trait[] | ((out: L) => Trait[]);
  lands?(page: Page, mem: MemPage): L | Promise<L>;
  expect?: ExpectList<Out>;
  instanceOptions?: Block<Out, Out>["instanceOptions"];
}

export interface PageSelf<Out extends Checkpoint<string>, R, Nav> {
  /**
   * An expectation of this page, written right here: `expects: (page) => ({ saved: page.expect({ description, verify: [...] }) })`.
   * What a scenario expects on the page, in its words: the demo and Waygraph Studio show the description.
   */
  expect(spec: Omit<ExpectBlockOptions<Out>, "checkpoint" | "name"> & { name?: string }): ExpectBlock<Out>;
  /**
   * A Method of this page, written right here: `do: (page) => ({ fill: page.method({ async act(p) { ... } }) })`. Its name
   * is the key (`login-fill`), it starts and, unless `to` names another page, ends on this page.
   */
  /** A link of this shell, for `links`: a Nav valid from every page it covers. */
  link<const To extends PageName | "parent" | Checkpoint<string>>(spec: InlineLink<To>): NavBlock<To extends "parent" ? Checkpoint<string> : To extends string ? Checkpoint<To> : To extends Checkpoint<string> ? To : never>;
  /**
   * A Method with params: a function of them returning the Method, for what the scenario chooses (a drag from here to there)
   * and no mem key fits. `Page.do.drag({ x: 1, y: 2 }, { x: 9, y: 2 })` is the Block; its name carries the values.
   * @example drag: self.method((from: Point, to: Point) => ({ async act(p) { await p.mouse.move(from.x, from.y); … } }))
   */
  method<A extends unknown[]>(make: (...args: A) => InlineMethod<Out, Out> & { to?: undefined }): (...args: A) => MethodBlock<Out, Out>;
  method(spec: InlineMethod<Out, Out> & { to?: undefined }): MethodBlock<Out, Out>;
  method<const To extends LandsOn>(spec: InlineMethod<Out, CpOfLands<To>> & { to: To | readonly To[] }): MethodBlock<Out, CpOfLands<To>>;
  readonly checkpoint: Out;
  readonly read: PageReadKeys<R>;
  readonly nav: Nav;
}

/** A page's Checkpoint: the value given, or one made from a name (`checkpoint: "Login"`). */
export type CheckpointOf<C> = C extends string ? Checkpoint<C> : C extends Checkpoint<string> ? C : never;

/**
 * What a Method kept in its own file takes: the page's name, so the file imports only this type (not the page, which
 * imports the Method). `export const signIn = (page: PageHandle<"Login">) => page.method({ async act(p) { ... } })`.
 */
export type PageHandle<Name extends string> = Pick<PageSelf<Checkpoint<Name>, Record<never, never>, undefined>, "method" | "checkpoint">;

export type PageBlockOptions<
  Out extends Checkpoint<string>,
  M extends Record<string, PageMethodEntry> = Record<string, PageMethodEntry>,
  E extends Record<string, PageExpectEntry> = Record<string, PageExpectEntry>,
  R extends PageRead = PageRead,
  Nav = undefined,
  U extends string = string,
  Q extends string = never,
  F extends "folder" | undefined = undefined,
  C extends Checkpoint<string> | string = Out,
  Lk extends Record<string, unknown> = Record<never, never>,
> = {
  name: string;
  description?: string;
  /**
   * The Checkpoint this page confirms. A name makes it (`checkpoint: "Home"`): the page is its own Checkpoint, with nothing to
   * declare beforehand; `Home.checkpoint` is the value, for what must name it (`lands`, a flow's `from`).
   * Left out, the Block is a bare shell: it covers pages (`covers`) but is no page itself.
   */
  checkpoint?: C;
  verify?: Trait[] | ((out: Out) => Trait[]);
  /**
   * What this Block promises wherever it's used, checked after its verify: Expect Blocks, Traits, `Key.is(...)`. A
   * Block that can land in several places lists them per outcome. Read-only and run together; a step can drop them
   * (`{ expect: false }`) or add its own.
   * @example expect: [ExpectArchivedToastBlock] · expect: { EquipmentDetail: [ExpectSavedBlock], EquipmentAdd: [ExpectNameRequiredBlock] }
   */
  expect?: ExpectList<Out>;
  /**
   * A screenshot of this page whenever a step lands on it (`true`, or `{ fullPage: true }`): kept with the run, and the
   * newest one shows on Waygraph Studio's map.
   */
  screenshot?: StepScreenshot;
  requires?: readonly MemKey<unknown>[];
  /**
   * Methods available on this page: a record of Blocks (or `() => Block` factories, lazy so the page object can colocate
   * method definitions), or an array. A record's Blocks are also the page's `do`, by name, typed.
   * @deprecated Name them in `do: () => ({ addItem: AddItemBlock })`. `waygraph upgrade --codemod page-object` converts a project.
   */
  methods?: readonly PageMethodEntry[] | M;
  /**
   * What the page shows: its fields, read after a step lands here (the run log, the demo, Waygraph Studio and checks
   * read them). Field types are inferred. Write it before `do` and `expects`, which build on it.
   * @example read: (ctx) => ({ sort: ctx.page.value(Sel.sort), modalOpen: ctx.page.visible(Sel.modal) })
   */
  read?: (ctx: ReadCtx) => R;
  /** The namespace of its fields in the run log (`sort` is `inventory.sort`). Default: the Checkpoint's name, lower-cased first. */
  readAs?: string;
  /**
   * What you can do here: the page's moves by name, from a function of the page, called the first time the page's `do`
   * is used (after every file is loaded, so the page and its Methods can import each other).
   * @example do: () => ({ addToCart: AddToCart, openModal: OpenModal })
   */
  do?: (page: PageSelf<Out, R, Nav>) => M;
  /**
   * What a scenario can expect on this page, by name: Expect Blocks, Traits (`page.read.modalOpen.is(true)`), or
   * `() => Block` factories; as a record, or a function of the page (called the first time it's used). The page's
   * `expects`, typed, for a step's `expect: [...]`.
   * @example expects: (page) => ({ modalShown: page.read.modalOpen.is(true), saved: SavedExpectBlock })
   */
  expects?: E | ((page: PageSelf<Out, R, Nav>) => E);
  /**
   * The Nav Block that opens this page (its `_nav.block.ts`): the page's `nav`, so a flow imports the page alone.
   * @deprecated Give the page its own `url` (or `click`) and `from`: the page opens itself, `map().gotoPage(LoginPage)`.
   * `waygraph upgrade --codemod nav` converts a project.
   * @example definePageBlock({ ..., nav: NavLoginBlock }) · map().gotoPage(LoginPage.nav).method(LoginPage.do.fillUsername)
   */
  nav?: NavBlock<Out>;
  /**
   * The pages it can be opened from, with a `url` or `click`. Omit = from anywhere. Set it for a page that only exists
   * after something else (every in-app page after sign-in), so route finding goes through the sign-in steps.
   * @example from: SIGNED_IN
   */
  from?: readonly Checkpoint<string>[];
  /**
   * Optional deep-link onto this page (`goto`). XOR with `click`. Omit when the
   * hub is arrival-only (previous Block already resolved here).
   */
  url?: U | ((mem: MemPage) => string);
  /**
   * The query params the page keeps in its address (`?tab=files`): state of the page, not a page of its own. `Page.go({ id, tab })`
   * opens with them, `Page.setQuery({ tab })` changes them, and arrival checks them.
   * @example query: ["tab", "filter"]
   */
  query?: readonly Q[];
  /**
   * `"folder"`: the page's address is its folder under `src/map/` (`requests/[id]/` is `/requests/[id]`), as in Next.js and
   * Nuxt; no `url` to write, and it can't disagree with where the page lives. `Page.go({ id })` fills the `[id]`.
   */
  route?: F;
  /**
   * The page lives in an iframe on another page (an embedded widget): its Blocks, checks and read see the page with every
   * locator inside this frame, so no selector carries a prefix.
   * @example frame: "#zsign-embed"
   */
  frame?: string;
  /**
   * The page covers other pages, as a shell does (a sidebar, a top bar): `"children"` is every page under its folder
   * (nested shells stack), a list of names is those pages wherever they live. What the shell declares (`links`,
   * `interrupts`, and its `read`) applies on every covered page, and the map draws it as one box around them.
   * @example covers: "children" · covers: ["Documents", "Templates"]
   */
  covers?: "children" | readonly PageName[];
  /**
   * The links every covered page has (a sidebar's): `Shell.links.documents`, each a Nav valid from any covered page, so a
   * flow writes `.gotoPage(Shell.links.documents)` once instead of a Nav per page.
   * @example links: (self) => ({ documents: self.link({ to: "Documents", click: Sel.documents }) })
   */
  links?: (self: PageSelf<CheckpointOf<C>, R, Nav>) => Lk;
  /** A menu that hides its links until opened (a burger, a user dropdown): the selector of what opens it; a link clicks it first. */
  opens?: string;
  /**
   * What can appear on any covered page and get in the way (a cookie banner, a sound prompt), each handled where it
   * shows up: `when` is the selector that shows it, `do` what to do. Logged, and shown in the demo; never a step.
   */
  interrupts?: Record<string, { when: string; do: (page: Page) => Promise<void> }>;
  /** Optional click-nav onto this page. XOR with `url`. */
  click?: string | ((mem: MemPage) => string);
  instanceOptions?: Block<Checkpoint<string>, Out>["instanceOptions"];
  /**
   * The accounts that can open this page; without it, every account. The access tests try it as each other account
   * and expect it not to open; `waygraph check` flags a flow as one of them that goes there.
   * @example for: [PlantManager, Admin]
   */
  for?: readonly Account[];
};

/**
 * Page hub Block: one Checkpoint = this screen; methods hang off the hub for
 * readability / auto grouping. Runtime is still a Block (`__waygraphKind = "page"`).
 * `act` is goto/click when `url`/`click` is set, otherwise a no-op (already here).
 * Child methods stay ordinary Blocks for graph edges - the page only registers them.
 * Branded `__wgFactory: "page"` (not `"nav"`) - both are accepted by
 * {@link MapBuilder.gotoPage} / {@link MapBuilder.gotoExternal}.
 */
export type PageBlock<
  Out extends Checkpoint<string>,
  M extends Record<string, PageMethodEntry> = Record<string, PageMethodEntry>,
  Nav = undefined,
  E extends Record<string, PageExpectEntry> = Record<never, never>,
  R = Record<never, never>,
  U extends string = string,
  Q extends string = never,
  F extends "folder" | undefined = undefined,
  Lk extends Record<string, unknown> = Record<never, never>,
> = Omit<
  DefinedBlock<Checkpoint<string>, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stubAfter" | "stubOnError"
> & {
  readonly __wgFactory?: "page";
  /** Resolved method Blocks registered at define time. */
  readonly methods: readonly SomeDefinedBlock[];
  /**
   * The page's Methods by name, each its own Block type: what a flow does on this page, from one import.
   * @example map().gotoPage(Inventory.nav).method(Inventory.do.addItem, { expect: [ExpectBadgeBlock] })
   */
  readonly do: PageMethods<M>;
  /** The Nav Block that opens this page (`nav` in `definePageBlock`). */
  readonly nav: Nav;
  /** The page's Checkpoint, as a value: for `lands`, a Method's `from`/`to`, a flow's start. */
  readonly checkpoint: Out;
  /** The page's expectations by name (Expect Blocks and Traits): what a step here can expect. */
  readonly expects: PageMethods<E>;
  /** What the page shows, as typed keys: `Inventory.read.sort.is("az")`. */
  readonly read: PageReadKeys<R>;
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): PageBlock<Out, M, Nav, E, R, U, Q, F, Lk>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): PageBlock<Out, M, Nav, E, R, U, Q, F, Lk>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): PageBlock<Out, M, Nav, E, R, U, Q, F, Lk>;
  stubBefore(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out, M, Nav, E, R, U, Q, F, Lk>;
  stubAfter(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out, M, Nav, E, R, U, Q, F, Lk>;
  stubOnError(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out, M, Nav, E, R, U, Q, F, Lk>;
} & PageGo<Out, U, Q> & PageFolderGo<Out, F> & PageLinks<Lk>;

/** A record of page methods with each `() => Block` factory resolved to its Block. */
export type PageMethods<M> = { readonly [K in keyof M]: M[K] extends () => infer B ? B : M[K] };

/** Whether `entry` is a Block (it has an instruction): the entries of `do` and `expects` can also be Traits. */
const isBlockEntry = (entry: unknown): entry is SomeDefinedBlock => typeof entry === "object" && entry !== null && "instruction" in entry;

const resolveEntry = (entry: unknown) => (typeof entry === "function" ? (entry as () => unknown)() : entry);

/** @see {@link PageBlockOptions} */
export function definePageBlock<
  const C extends Checkpoint<string> | string,
  M extends Record<string, PageMethodEntry> = Record<never, never>,
  Nav extends NavBlock<CheckpointOf<C>> | undefined = undefined,
  E extends Record<string, PageExpectEntry> = Record<never, never>,
  R extends PageRead = Record<never, never>,
  const U extends string = string,
  const Q extends string = never,
  F extends "folder" | undefined = undefined,
  Lk extends Record<string, unknown> = Record<never, never>,
>(options: PageBlockOptions<CheckpointOf<C>, M, E, R, Nav, U, Q, F, C, Lk> & { nav?: Nav }): PageBlock<CheckpointOf<C>, M, Nav, E, R, U, Q, F, Lk> {
  type Out = CheckpointOf<C>;
  const cp = (typeof options.checkpoint === "string" ? makeCheckpoint(options.checkpoint) : (options.checkpoint ?? makeCheckpoint("*"))) as Out;
  if (options.url !== undefined && options.click !== undefined) {
    throw new Error(
      `definePageBlock("${options.name}"): pass url XOR click (or neither for arrival-only hub)`,
    );
  }
  const { nav, expects, methods, do: doOf, read: readOf, readAs, for: given, from: opensFrom, query, route, frame, covers, links: linksOf, opens: opensBy, interrupts, ...restOptions } = options;
  if (frame) registerFrame(options.checkpoint === undefined ? "" : typeof options.checkpoint === "string" ? options.checkpoint : options.checkpoint.__state, frame);
  if (route === "folder" && (options.url !== undefined || options.click !== undefined)) {
    throw new Error(`definePageBlock("${options.name}"): route: "folder" gives the address; drop url/click`);
  }
  const folderUrl = route === "folder" ? addressFromFolder(options.name) : undefined;
  const rest = { ...restOptions, checkpoint: cp, ...(folderUrl ? { url: folderUrl } : {}) };
  const pageUrl = folderUrl ?? options.url;
  const built = defineNavigating(rest) as unknown as PageBlock<Out, M, Nav, E, R, U, Q, F, Lk>;
  markFor(built, given);
  // A page's screenshot is taken whenever a step lands on it, not only when this hub runs as a step.
  if (options.screenshot) screenshotPage(cp.__state, options.screenshot === true ? {} : options.screenshot);

  // What the page shows: a Read Block of its own, read where the page's step lands, and the keys to check it by.
  const namespace = readAs ?? namespaceOf(cp.__state);
  let readBlock: ReadBlock | undefined;
  if (readOf) {
    readBlock = defineReadBlock({
      name: `read-${options.name.replace(/^page-/, "")}`,
      description: options.description ?? "",
      from: cp,
      instruction: { read: (ctx) => ({ namespace, fields: readOf(ctx) }) },
    });
  }

  // `do` and `expects` as functions of the page are called the first time they're used: by then every file is loaded, so a
  // page and its Methods can import each other. The page they're given has what's defined so far (its read and nav).
  const slug = options.name.replace(/^page-/, "");
  const inline = (spec: unknown) => ({ __inlineMethod: spec });
  const inlineExpect = (spec: unknown) => ({ __inlineExpect: spec });
  const self = { checkpoint: cp, read: readKeys(namespace), nav, method: inline, expect: inlineExpect, link: (spec: unknown) => ({ __inlineLink: spec }) } as unknown as PageSelf<Out, R, Nav>;
  /** An inline Method becomes a real one, named for its key. */
  const toBlock = (key: string, entry: unknown): unknown => {
    if (typeof entry === "object" && entry !== null && "__inlineExpect" in entry) {
      const spec = (entry as { __inlineExpect: Omit<ExpectBlockOptions<Out>, "checkpoint" | "name"> & { name?: string } }).__inlineExpect;
      return defineExpectBlock({ name: `expect-${slug}-${key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`, ...spec, checkpoint: cp } as ExpectBlockOptions<Out>);
    }
    if (typeof entry !== "object" || entry === null || !("__inlineMethod" in entry)) return resolveEntry(entry);
    const given = (entry as { __inlineMethod: InlineMethod<Out, Out> | ((...args: unknown[]) => InlineMethod<Out, Out>) }).__inlineMethod;
    // A Method with params is a function of them: each call is the Block for those values.
    if (typeof given === "function") {
      return (...args: unknown[]) => build(key, given(...args), args.length ? `(${args.map((a) => JSON.stringify(a)).join(", ")})` : "");
    }
    return build(key, given, "");
  };
  const build = (key: string, spec: InlineMethod<Out, Out>, suffix: string): unknown => {
    const targets = (spec.to === undefined ? [cp] : Array.isArray(spec.to) ? spec.to : [spec.to]).map((t) => (typeof t === "string" ? makeCheckpoint(t) : t)) as Checkpoint<string>[];
    const { to: _to, ...flat } = spec;
    return defineMethodBlock({
      name: `${slug}-${key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}${suffix}`,
      from: cp,
      to: targets.length === 1 ? (targets[0] as Checkpoint<string>) : targets,
      ...flat,
    } as never);
  };
  const once = <T,>(make: () => T): (() => T) => {
    let value: T | undefined;
    let made = false;
    return () => {
      if (!made) {
        value = make();
        made = true;
      }
      return value as T;
    };
  };
  const doRecord = once(() => Object.freeze(Object.fromEntries(Object.entries(doOf ? doOf(self) : (methods && !Array.isArray(methods) ? methods : {})).map(([k, entry]) => [k, toBlock(k, entry)]))));
  const expectRecord = once(() =>
    Object.freeze(Object.fromEntries(Object.entries(typeof expects === "function" ? expects(self) : (expects ?? {})).map(([k, entry]) => [k, toBlock(k, entry)]))),
  );
  const methodList = once(() => {
    const named = Object.values(doRecord()).filter(isBlockEntry);
    const listed = Array.isArray(methods) ? methods.map(resolveEntry).filter(isBlockEntry) : [];
    return Object.freeze([...named, ...listed]) as readonly SomeDefinedBlock[];
  });

  // A page that covers others is a layout too: what it declares applies on every page it covers.
  if (covers !== undefined || linksOf || interrupts) {
    let layout: ReturnType<typeof defineLayout> | undefined;
    const coverLayout = () =>
      (layout ??= defineLayout({
        name: slug,
        ...(options.description ? { description: options.description } : {}),
        go: Object.fromEntries(
          Object.entries(linksOf ? (linksOf(self) as Record<string, { __inlineLink: InlineLink<string | Checkpoint<string>> }>) : {}).map(([key, entry]) => [
            key,
            { ...entry.__inlineLink, to: entry.__inlineLink.to === "parent" ? "parent" : typeof entry.__inlineLink.to === "string" ? makeCheckpoint(entry.__inlineLink.to) : entry.__inlineLink.to },
          ]),
        ) as never,
        ...(Array.isArray(covers) ? { on: (covers as readonly string[]).map((n) => makeCheckpoint(n)) } : {}),
        ...(opensBy ? { opens: opensBy } : {}),
        ...(interrupts ? { interrupts } : {}),
      }));
    Object.defineProperty(built, "__waygraphCoverLayout", { get: coverLayout, enumerable: false, configurable: true });
    Object.defineProperty(built, "links", { get: () => coverLayout().go, enumerable: false, configurable: true });
    // What the shell reads is read on every page it covers.
    if (readBlock && covers !== undefined) {
      Object.defineProperty(readBlock, "from", { get: () => (layoutState(slug).loaded ? layoutState(slug).covers : [cp.__state]), enumerable: true, configurable: true });
    }
  }
  if (options.checkpoint === undefined) mark(built, "__waygraphBare", true);
  if (frame) mark(built, "__waygraphFrame", frame);
  if (covers !== undefined) mark(built, "__waygraphCovers", covers);
  if (route === "folder") mark(built, "__waygraphRoute", "folder");
  markRoute(built, opensFrom?.map((c) => c.__state) ?? ["*"], [cp.__state]);
  mark(built, "__waygraphKind", "page");
  mark(built, "__waygraphSalt", "page");
  if (readBlock) mark(built, "__waygraphReadBlock", readBlock);
  // Everything the page names counts as used: none is an orphan.
  Object.defineProperty(built, "__waygraphMethods", {
    get: () => [...(nav ? [nav.name] : []), ...methodList().map((m) => m.name), ...Object.values(expectRecord()).filter(isBlockEntry).map((b) => b.name)],
    enumerable: false,
    configurable: true,
  });
  // Not enumerable, so a copy made by spreading doesn't call them early; a decorated copy keeps them (PAGE_FIELDS).
  Object.defineProperty(built, "methods", { get: methodList, enumerable: false, configurable: true });
  Object.defineProperty(built, "do", { get: doRecord, enumerable: false, configurable: true });
  Object.defineProperty(built, "expects", { get: expectRecord, enumerable: false, configurable: true });
  Object.defineProperty(built, "checkpoint", { value: cp, enumerable: false, configurable: true });
  Object.defineProperty(built, "read", { value: self.read, enumerable: false, configurable: true });
  Object.defineProperty(built, "nav", { value: nav, enumerable: false, configurable: true });
  // The markers `defineNavBlock` sets: a page with a url or click is as known and coverable as a Nav.
  if (typeof pageUrl === "string") {
    mark(built, "__waygraphNavUrl", pageUrl);
  } else if (typeof pageUrl === "function") {
    // A url built from mem: the manifest reads its source for the pattern it makes (`/requests/:id`).
    mark(built, "__waygraphNavUrlFn", pageUrl);
  }
  if (pageUrl !== undefined || options.click !== undefined) {
    mark(built, "__waygraphPageDeepLink", true);
  }
  if (options.click !== undefined) {
    mark(built, "__waygraphNavClick", options.click);
  }
  if (query?.length) mark(built, "__waygraphQuery", [...query]);
  // `Page.go({ id, tab })`: the same page opened at one address of its pattern, its query params in the address.
  const pathParams = typeof pageUrl === "string" && /\/:\w+|\[\w+\]/.test(pageUrl);
  if (typeof pageUrl === "string" && (pathParams || query?.length)) {
    const pattern = pageUrl;
    const queryNames = new Set<string>(query ?? []);
    Object.defineProperty(built, "go", {
      enumerable: false,
      value: (params: Record<string, string | number>) => {
        const path = pattern.replace(/(?<=\/):(\w+)|\[(\w+)\]/g, (_m, a: string | undefined, b: string | undefined) => encodeURIComponent(String(params[(a ?? b) as string])));
        const search = new URLSearchParams(Object.entries(params).filter(([k, v]) => queryNames.has(k) && v !== undefined).map(([k, v]) => [k, String(v)]));
        const url = search.size ? `${path}?${search}` : path;
        const wanted = [...search.entries()];
        const arrives: Trait[] = wanted.length
          ? [{ name: `query(${search})`, says: `the address has ?${search}`, async check(page) { const have = new URL(page.url()).searchParams; return wanted.every(([k, v]) => have.get(k) === v) ? true : { ok: false, saw: `?${have}` }; } }]
          : [];
        const own = Array.isArray(rest.verify) ? rest.verify : undefined;
        const at = defineNavigating({ ...rest, ...(own ? { verify: [...own, ...arrives] } : {}), name: `${options.name}(${Object.values(params).join(", ")})`, url });
        markRoute(at, opensFrom?.map((c) => c.__state) ?? ["*"], [cp.__state]);
        mark(at, "__waygraphKind", "page");
        mark(at, "__waygraphSalt", "page");
        mark(at, "__waygraphNavUrl", url);
        mark(at, "__waygraphPageDeepLink", true);
        return at;
      },
    });
  }
  // `Page.setQuery({ tab })`: changes the query of the page it's on, stays on the page, and proves the address says so.
  if (query?.length) {
    const queryNames = new Set<string>(query);
    Object.defineProperty(built, "setQuery", {
      enumerable: false,
      value: (values: Record<string, string | number | undefined>) => {
        const given = Object.entries(values).filter(([k, v]) => queryNames.has(k) && v !== undefined);
        const label = given.map(([k, v]) => `${k}=${v}`).join("&");
        return defineMethodBlock({
          name: `${options.name}-set-query(${label})`,
          from: cp,
          to: cp,
          async act(page) {
            const url = new URL(page.url());
            for (const [k, v] of given) url.searchParams.set(k, String(v));
            await page.goto(url.toString());
          },
          verify: [
            {
              name: `query(${label})`,
              says: `the address has ${label}`,
              async check(page) {
                const have = new URL(page.url()).searchParams;
                const wrong = given.filter(([k, v]) => have.get(k) !== String(v));
                return wrong.length ? { ok: false, saw: `?${have}` } : true;
              },
            },
          ],
        });
      },
    });
  }
  if (opensFrom?.length) mark(built, "__waygraphNavFrom", opensFrom.map((c) => c.__state));
  return built;
}
