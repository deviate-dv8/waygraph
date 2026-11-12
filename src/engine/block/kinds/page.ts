// A Page Block: "you have arrived" - the hub other pages navigate to, verified by what the page shows.
import { defineNavigating } from "./nav.js";
import { defineMethodBlock } from "./method.js";
import type { Account } from "../../flow/account.js";
import { markFor } from "../access.js";
import { mark } from "../mark.js";
import type { Block, DefinedBlock, StepScreenshot } from "../block.js";
import { screenshotPage } from "../../run/screenshot.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { Trait } from "../../trait/trait.js";
import { MemPage } from "../../mem/mem.js";
import type { MemKey } from "../../mem/mem.js";
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
  | (() => SomeDefinedBlock);


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
export interface PageSelf<Out extends Checkpoint<string>, R, Nav> {
  readonly checkpoint: Out;
  readonly read: PageReadKeys<R>;
  readonly nav: Nav;
}

export type PageBlockOptions<
  Out extends Checkpoint<string>,
  M extends Record<string, PageMethodEntry> = Record<string, PageMethodEntry>,
  E extends Record<string, PageExpectEntry> = Record<string, PageExpectEntry>,
  R extends PageRead = PageRead,
  Nav = undefined,
  U extends string = string,
  Q extends string = never,
> = {
  name: string;
  description?: string;
  /** The Checkpoint this page hub confirms: its value (`Home`). */
  checkpoint: Out;
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
  /** The page's expectations by name (Expect Blocks and Traits): what a step here can expect. */
  readonly expects: PageMethods<E>;
  /** What the page shows, as typed keys: `Inventory.read.sort.is("az")`. */
  readonly read: PageReadKeys<R>;
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): PageBlock<Out, M, Nav, E, R, U, Q>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): PageBlock<Out, M, Nav, E, R, U, Q>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): PageBlock<Out, M, Nav, E, R, U, Q>;
  stubBefore(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out, M, Nav, E, R, U, Q>;
  stubAfter(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out, M, Nav, E, R, U, Q>;
  stubOnError(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out, M, Nav, E, R, U, Q>;
} & PageGo<Out, U, Q>;


/** The params of a page's address: `/requests/:id` and `/requests/[id]` have `id`; none: `never`. */
export type UrlParams<U extends string> = string extends U
  ? never
  : U extends `${string}/:${infer P}/${infer Rest}`
    ? P | UrlParams<`/${Rest}`>
    : U extends `${string}/:${infer P}`
      ? P
      : U extends `${string}[${infer P}]${infer Rest}`
        ? P | UrlParams<Rest>
        : never;

type Params<U extends string, Q extends string> = { [K in UrlParams<U>]: string | number } & { [K in Q]?: string | number };

/**
 * `Page.go({ id, tab })`: the page opened at one address of its pattern (path params are required, `query` ones optional),
 * and `Page.setQuery({ tab })`: a Method that changes the query on the page it's on. Each present when it applies.
 */
export type PageGo<Out extends Checkpoint<string>, U extends string, Q extends string> = ([UrlParams<U>] extends [never]
  ? [Q] extends [never]
    ? unknown
    : { readonly go: (params: Params<U, Q>) => DefinedBlock<Checkpoint<string>, Out> }
  : { readonly go: (params: Params<U, Q>) => DefinedBlock<Checkpoint<string>, Out> }) &
  ([Q] extends [never] ? unknown : { readonly setQuery: (values: { [K in Q]?: string | number }) => DefinedBlock<Out, Out> });

/** A record of page methods with each `() => Block` factory resolved to its Block. */
export type PageMethods<M> = { readonly [K in keyof M]: M[K] extends () => infer B ? B : M[K] };

/** Whether `entry` is a Block (it has an instruction): the entries of `do` and `expects` can also be Traits. */
const isBlockEntry = (entry: unknown): entry is SomeDefinedBlock => typeof entry === "object" && entry !== null && "instruction" in entry;

const resolveEntry = (entry: unknown) => (typeof entry === "function" ? (entry as () => unknown)() : entry);

/** @see {@link PageBlockOptions} */
export function definePageBlock<
  Out extends Checkpoint<string>,
  M extends Record<string, PageMethodEntry> = Record<never, never>,
  Nav extends NavBlock<Out> | undefined = undefined,
  E extends Record<string, PageExpectEntry> = Record<never, never>,
  R extends PageRead = Record<never, never>,
  const U extends string = string,
  const Q extends string = never,
>(options: PageBlockOptions<Out, M, E, R, Nav, U, Q> & { nav?: Nav }): PageBlock<Out, M, Nav, E, R, U, Q> {
  if (options.url !== undefined && options.click !== undefined) {
    throw new Error(
      `definePageBlock("${options.name}"): pass url XOR click (or neither for arrival-only hub)`,
    );
  }
  const { nav, expects, methods, do: doOf, read: readOf, readAs, for: given, from: opensFrom, query, ...rest } = options;
  const built = defineNavigating(rest) as unknown as PageBlock<Out, M, Nav, E, R, U, Q>;
  markFor(built, given);
  // A page's screenshot is taken whenever a step lands on it, not only when this hub runs as a step.
  if (options.screenshot) screenshotPage(options.checkpoint.__state, options.screenshot === true ? {} : options.screenshot);

  // What the page shows: a Read Block of its own, read where the page's step lands, and the keys to check it by.
  const namespace = readAs ?? namespaceOf(options.checkpoint.__state);
  let readBlock: ReadBlock | undefined;
  if (readOf) {
    readBlock = defineReadBlock({
      name: `read-${options.name.replace(/^page-/, "")}`,
      description: options.description ?? "",
      from: options.checkpoint,
      instruction: { read: (ctx) => ({ namespace, fields: readOf(ctx) }) },
    });
  }

  // `do` and `expects` as functions of the page are called the first time they're used: by then every file is loaded, so a
  // page and its Methods can import each other. The page they're given has what's defined so far (its read and nav).
  const self = { checkpoint: options.checkpoint, read: readKeys(namespace), nav } as PageSelf<Out, R, Nav>;
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
  const doRecord = once(() => Object.freeze(Object.fromEntries(Object.entries(doOf ? doOf(self) : (methods && !Array.isArray(methods) ? methods : {})).map(([k, entry]) => [k, resolveEntry(entry)]))));
  const expectRecord = once(() =>
    Object.freeze(Object.fromEntries(Object.entries(typeof expects === "function" ? expects(self) : (expects ?? {})).map(([k, entry]) => [k, resolveEntry(entry)]))),
  );
  const methodList = once(() => {
    const named = Object.values(doRecord()).filter(isBlockEntry);
    const listed = Array.isArray(methods) ? methods.map(resolveEntry).filter(isBlockEntry) : [];
    return Object.freeze([...named, ...listed]) as readonly SomeDefinedBlock[];
  });

  markRoute(built, opensFrom?.map((c) => c.__state) ?? ["*"], [options.checkpoint.__state]);
  mark(built, "__waygraphKind", "page");
  mark(built, "__waygraphSalt", "page");
  if (readBlock) mark(built, "__waygraphReadBlock", readBlock);
  // Every Block the page names (its nav, its methods and its expectations) counts as used: none is an orphan.
  Object.defineProperty(built, "__waygraphMethods", {
    get: () => [...(nav ? [nav.name] : []), ...methodList().map((m) => m.name), ...Object.values(expectRecord()).filter(isBlockEntry).map((b) => b.name)],
    enumerable: false,
    configurable: true,
  });
  // Fields a decorated copy (withVerify, stubBefore) keeps by descriptor (see PAGE_FIELDS): not enumerable, so a copy made
  // by spreading doesn't call them early.
  Object.defineProperty(built, "methods", { get: methodList, enumerable: false, configurable: true });
  Object.defineProperty(built, "do", { get: doRecord, enumerable: false, configurable: true });
  Object.defineProperty(built, "expects", { get: expectRecord, enumerable: false, configurable: true });
  Object.defineProperty(built, "read", { value: self.read, enumerable: false, configurable: true });
  Object.defineProperty(built, "nav", { value: nav, enumerable: false, configurable: true });
  // Same marker `defineNavBlock` sets, same reason - a page hub with a
  // `url` (deep-link) is exactly as "known, coverable" as a plain
  // `defineNavBlock`, and in practice most real projects' own nav Blocks
  // ARE page hubs (methods hanging off them), not bare NavBlocks - the real
  // saucedemo fixture this whole package tests against uses definePageBlock
  // for every one of its own nav-* Blocks. Missing this here meant the
  // marker existed but was never actually set on any real project's Blocks.
  if (typeof options.url === "string") {
    mark(built, "__waygraphNavUrl", options.url);
  } else if (typeof options.url === "function") {
    // A url built from mem: the manifest reads its source for the pattern it makes (`/requests/:id`).
    mark(built, "__waygraphNavUrlFn", options.url);
  }
  if (options.url !== undefined || options.click !== undefined) {
    mark(built, "__waygraphPageDeepLink", true);
  }
  if (options.click !== undefined) {
    mark(built, "__waygraphNavClick", options.click);
  }
  if (query?.length) mark(built, "__waygraphQuery", [...query]);
  // `Page.go({ id, tab })`: the same page opened at one address of its pattern, its query params in the address.
  const pathParams = typeof options.url === "string" && /\/:\w+|\[\w+\]/.test(options.url);
  if (typeof options.url === "string" && (pathParams || query?.length)) {
    const pattern = options.url;
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
        markRoute(at, opensFrom?.map((c) => c.__state) ?? ["*"], [options.checkpoint.__state]);
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
          from: options.checkpoint,
          to: options.checkpoint,
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
