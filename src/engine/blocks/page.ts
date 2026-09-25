// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { checkpoint } from "../../types.js";
import type { Block, Checkpoint, DefinedBlock, WaygraphHighlight } from "../../types.js";
import type { Trait } from "../../trait.js";
import { MemPage } from "../../mem-page.js";
import type { MemKey } from "../../mem-page.js";
import { defineBlock } from "../core.js";
import type { Page } from "@playwright/test";

/** One Block (or lazy factory) registered on a {@link PageBlock}. */
export type PageMethodEntry =
  | DefinedBlock<any, any>
  | (() => DefinedBlock<any, any>);


export type PageBlockOptions<Out extends Checkpoint<string>> = {
  name: string;
  description?: string;
  /** Checkpoint tag for this screen (hub). */
  checkpoint: Out["__state"];
  verify?: Trait[] | ((out: Out) => Trait[]);
  stubBefore?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  stubAfter?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  stubOnError?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  /** @deprecated Prefer stubAfter. */
  highlights?:
    | readonly WaygraphHighlight[]
    | ((out: Out) => readonly WaygraphHighlight[]);
  requires?: readonly MemKey<any>[];
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
  readonly methods: readonly DefinedBlock<any, any>[];
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): PageBlock<Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): PageBlock<Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): PageBlock<Out>;
  stubBefore(stub: import("../../highlights.js").HighlightStubPhase): PageBlock<Out>;
  stubBefore(stub: import("../../highlights.js").StubLifecycleFn<Out>): PageBlock<Out>;
  stubBefore(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): PageBlock<Out>;
  stubAfter(stub: import("../../highlights.js").HighlightStubPhase): PageBlock<Out>;
  stubAfter(stub: import("../../highlights.js").StubLifecycleFn<Out>): PageBlock<Out>;
  stubAfter(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): PageBlock<Out>;
  stubOnError(stub: import("../../highlights.js").HighlightStubPhase): PageBlock<Out>;
  stubOnError(stub: import("../../highlights.js").StubLifecycleFn<Out>): PageBlock<Out>;
  stubOnError(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): PageBlock<Out>;
};


function resolvePageMethods(
  methods?: readonly PageMethodEntry[] | Record<string, PageMethodEntry>,
): DefinedBlock<any, any>[] {
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
  const built = defineBlock<Checkpoint<string>, Out>({
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    ...(options.instanceOptions ? { instanceOptions: options.instanceOptions } : {}),
    instruction: {
      async act(page, _input, mem) {
        if (options.url !== undefined) {
          const url = typeof options.url === "function" ? options.url(mem) : options.url;
          await (page as unknown as Page).goto(url);
        } else if (options.click !== undefined) {
          const selector =
            typeof options.click === "function" ? options.click(mem) : options.click;
          await (page as unknown as Page).locator(selector).click();
        }
        // else: arrival-only hub — previous Block already landed here
      },
      resolve: () => checkpoint(options.checkpoint) as Out,
      ...(options.verify ? { verify: options.verify } : {}),
      ...(options.stubBefore ? { stubBefore: options.stubBefore } : {}),
      ...(options.stubAfter ? { stubAfter: options.stubAfter } : {}),
      ...(options.stubOnError ? { stubOnError: options.stubOnError } : {}),
      ...(options.highlights ? { highlights: options.highlights } : {}),
    },
  }) as PageBlock<Out>;

  Object.defineProperty(built, "__waygraphKind", {
    value: "page",
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(built, "__waygraphSalt", {
    value: "page",
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(built, "methods", {
    value: Object.freeze([...methodList]),
    enumerable: true,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(built, "__waygraphMethods", {
    value: methodList.map((m) => m.name),
    enumerable: false,
    configurable: false,
  });
  // Same marker `defineNavBlock` sets, same reason - a page hub with a
  // `url` (deep-link) is exactly as "known, coverable" as a plain
  // `defineNavBlock`, and in practice most real projects' own nav Blocks
  // ARE page hubs (methods hanging off them), not bare NavBlocks - the real
  // saucedemo fixture this whole package tests against uses definePageBlock
  // for every one of its own nav-* Blocks. Missing this here meant the
  // marker existed but was never actually set on any real project's Blocks.
  if (typeof options.url === "string") {
    Object.defineProperty(built, "__waygraphNavUrl", {
      value: options.url,
      enumerable: false,
      configurable: false,
    });
  }
  if (options.url !== undefined || options.click !== undefined) {
    Object.defineProperty(built, "__waygraphPageDeepLink", {
      value: true,
      enumerable: false,
      configurable: false,
    });
  }
  if (options.click !== undefined) {
    Object.defineProperty(built, "__waygraphNavClick", {
      value: options.click,
      enumerable: false,
      configurable: false,
    });
  }
  return built;
}
