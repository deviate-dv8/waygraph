// A Page Block: "you have arrived" - the hub other pages navigate to, verified by what the page shows.
import { defineNavigating } from "./nav.js";
import { mark } from "../mark.js";
import type { Block, DefinedBlock } from "../block.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { Trait } from "../../trait/trait.js";
import { MemPage } from "../../mem/mem.js";
import type { MemKey } from "../../mem/mem.js";
import { markRoute } from "../../checkpoint/route.js";
import type { SomeDefinedBlock } from "../some-block.js";

/** One Block (or lazy factory) registered on a {@link PageBlock}. */
export type PageMethodEntry =
  | SomeDefinedBlock
  | (() => SomeDefinedBlock);


/** Options for `definePageBlock`: the Checkpoint a page hub confirms and the Methods that hang off it. */
export type PageBlockOptions<Out extends Checkpoint<string>> = {
  name: string;
  description?: string;
  /** The Checkpoint this page hub confirms: its value (`Home`). */
  checkpoint: Out;
  verify?: Trait[] | ((out: Out) => Trait[]);
  requires?: readonly MemKey<unknown>[];
  /**
   * Methods available on this page. Array, or a record of Blocks / `() => Block`
   * factories (lazy so the page object can colocate method definitions).
   */
  methods?: readonly PageMethodEntry[] | Record<string, PageMethodEntry>;
  /**
   * Optional deep-link onto this page (`goto`). XOR with `click`. Omit when the
   * hub is arrival-only (previous Block already resolved here).
   */
  url?: string | ((mem: MemPage) => string);
  /** Optional click-nav onto this page. XOR with `url`. */
  click?: string | ((mem: MemPage) => string);
  instanceOptions?: Block<Checkpoint<string>, Out>["instanceOptions"];
};


/**
 * Page hub Block: one Checkpoint = this screen; methods hang off the hub for
 * readability / auto grouping. Runtime is still a Block (`__waygraphKind = "page"`).
 * `act` is goto/click when `url`/`click` is set, otherwise a no-op (already here).
 * Child methods stay ordinary Blocks for graph edges - the page only registers them.
 * Branded `__wgFactory: "page"` (not `"nav"`) - both are accepted by
 * {@link MapBuilder.gotoPage} / {@link MapBuilder.gotoExternal}.
 */
export type PageBlock<Out extends Checkpoint<string>> = Omit<
  DefinedBlock<Checkpoint<string>, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stubAfter" | "stubOnError"
> & {
  readonly __wgFactory?: "page";
  /** Resolved method Blocks registered at define time. */
  readonly methods: readonly SomeDefinedBlock[];
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): PageBlock<Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): PageBlock<Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): PageBlock<Out>;
  stubBefore(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out>;
  stubAfter(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out>;
  stubOnError(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): PageBlock<Out>;
};


function resolvePageMethods(
  methods?: readonly PageMethodEntry[] | Record<string, PageMethodEntry>,
): SomeDefinedBlock[] {
  if (!methods) return [];
  const entries = Array.isArray(methods) ? methods : Object.values(methods);
  return entries.map((entry) => (typeof entry === "function" ? entry() : entry));
}


/** @see {@link PageBlockOptions} */
export function definePageBlock<Out extends Checkpoint<string>>(
  options: PageBlockOptions<Out>,
): PageBlock<Out> {
  if (options.url !== undefined && options.click !== undefined) {
    throw new Error(
      `definePageBlock("${options.name}"): pass url XOR click (or neither for arrival-only hub)`,
    );
  }
  const methodList = resolvePageMethods(options.methods);
  const built = defineNavigating(options) as PageBlock<Out>;

  markRoute(built, ["*"], [options.checkpoint.__state]);
  mark(built, "__waygraphKind", "page");
  mark(built, "__waygraphSalt", "page");
  Object.defineProperty(built, "methods", {
    value: Object.freeze([...methodList]),
    enumerable: true,
    configurable: false,
    writable: false,
  });
  mark(built, "__waygraphMethods", methodList.map((m) => m.name));
  // Same marker `defineNavBlock` sets, same reason - a page hub with a
  // `url` (deep-link) is exactly as "known, coverable" as a plain
  // `defineNavBlock`, and in practice most real projects' own nav Blocks
  // ARE page hubs (methods hanging off them), not bare NavBlocks - the real
  // saucedemo fixture this whole package tests against uses definePageBlock
  // for every one of its own nav-* Blocks. Missing this here meant the
  // marker existed but was never actually set on any real project's Blocks.
  if (typeof options.url === "string") {
    mark(built, "__waygraphNavUrl", options.url);
  }
  if (options.url !== undefined || options.click !== undefined) {
    mark(built, "__waygraphPageDeepLink", true);
  }
  if (options.click !== undefined) {
    mark(built, "__waygraphNavClick", options.click);
  }
  return built;
}
