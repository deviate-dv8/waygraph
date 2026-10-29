// A Nav Block: gets to a page, by URL or by clicking a link, and lands on that page's Checkpoint.
import { mark } from "../mark.js";
import { checkpoint } from "../../checkpoint/checkpoint.js";
import type { Block, DefinedBlock } from "../block.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { Trait } from "../../trait/trait.js";
import { MemPage } from "../../mem/mem.js";
import type { MemKey } from "../../mem/mem.js";
import { defineBlock } from "../block.js";
import type { Page } from "@playwright/test";
import { markRoute, tagsOf } from "../../checkpoint/route.js";

/**
 * A Block whose only possible action is navigating to a URL - built via
 * {@link defineNavBlock}, never with a hand-authored `act()`. Extends `Block`
 * (same shape `DefinedBlock`/`ComposedBlock` already use), so it drops into
 * `map()`, `connect()`, `composeBlock()` exactly like any other
 * Block - no special-casing needed anywhere that only expects a `Block`.
 * See `openspec/specs/nav-block-and-check/spec.md` for why this exists.
 *
 * `__wgFactory` is a TypeScript-only brand so {@link MapBuilder.gotoPage} /
 * {@link MapBuilder.gotoExternal} can reject Assert/Method Blocks at compile
 * time (runtime still checks `__waygraphKind`). Decorate methods are re-stated
 * (via Omit) so `.stubBefore()` / `.withVerify()` keep the brand.
 */
export type NavBlock<Out extends Checkpoint<string>> = Omit<
  DefinedBlock<Checkpoint<string>, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stubAfter" | "stubOnError"
> & {
  readonly __wgFactory?: "nav";
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): NavBlock<Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): NavBlock<Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): NavBlock<Out>;
  stubBefore(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): NavBlock<Out>;
  stubAfter(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): NavBlock<Out>;
  stubOnError(stub: import("../../stub/stub.js").StubLifecycleFn<Out>): NavBlock<Out>;
};


/**
 * `defineNavBlock`'s own options - exactly one of `url`/`click` required,
 * enforced at compile time (giving both, or neither, is a type error - see
 * `typecheck/nav-block.types.ts`). `checkpoint` is the tag this NavBlock
 * resolves to once navigation completes - a NavBlock never branches on
 * observed evidence the way a regular Block can, so there's no `resolve`
 * logic to author; it always just declares "arrived."
 */
export type NavBlockOptions<Out extends Checkpoint<string>> = {
  name: string;
  description?: string;
  /** The Checkpoint this Nav lands on: its value (`Home`). */
  checkpoint: Out;
  /**
   * Checkpoint tags this Nav can run from. Omit (the default) = reachable from anywhere. Set it for
   * a page that only exists after something else - e.g. every in-app page after sign-in - so route
   * finding (`auto --blocks`, `pilot reach`, `traverse`) goes through the sign-in steps instead of
   * jumping straight there from the login page.
   * @example const SIGNED_IN = [Dashboard, CommandCenter] as const; // src/states/
   * defineNavBlock({ ..., from: SIGNED_IN })
   */
  from?: readonly Checkpoint<string>[];
  requires?: readonly MemKey<unknown>[];
  verify?: Trait[] | ((out: Out) => Trait[]);
  /**
   * Live per-instance menu rows for `waygraph auto` (see {@link Block.instanceOptions}).
   * When set, the explore menu lists one row per option instead of a single
   * generic nav edge - used by {@link defineMemNavBlock}.
   */
  instanceOptions?: Block<Checkpoint<string>, Out>["instanceOptions"];
} & (
  | {
      /**
       * Direct URL navigation. Accepts a plain string or a function
       * `(mem) => string` for parameterized routes (e.g.
       * `/dashboard/requests/:id` with a real id read from mem). The
       * escape hatch for the few real cases with no click path to get
       * there (a deep link from an email, a public share link) - not for
       * skipping past navigation an agent didn't feel like finding. Prefer
       * `click` whenever the target app actually has one.
       */
      url: string | ((mem: MemPage) => string);
      click?: never;
    }
  | {
      /**
       * Navigates by clicking a real element already on the page (a nav
       * link, a sidebar item) instead of teleporting straight to a URL -
       * the opinionated default. Accepts a Playwright selector string, or
       * a function `(mem) => selector` for a target that depends on mem
       * (e.g. clicking the row for a specific id). Verifying arrival is
       * `verify`'s job (typically `Trait.url(...)`), same as a `url`-based
       * NavBlock - the click itself is only ever awaited for its own
       * completion, not for whatever navigation it triggers.
       */
      click: string | ((mem: MemPage) => string);
      url?: never;
    }
);


/** A Block that navigates (a Nav, or a Page hub that has a url or click) and lands on its `checkpoint`. */
export function defineNavigating<Out extends Checkpoint<string>>(options: {
  name: string;
  description?: string | undefined;
  checkpoint: Out;
  url?: string | ((mem: MemPage) => string) | undefined;
  click?: string | ((mem: MemPage) => string) | undefined;
  requires?: Block<Checkpoint<string>, Out>["requires"];
  instanceOptions?: Block<Checkpoint<string>, Out>["instanceOptions"];
  verify?: Trait[] | ((out: Out) => Trait[]) | undefined;
}): DefinedBlock<Checkpoint<string>, Out> {
  return defineBlock<Checkpoint<string>, Out>({
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    ...(options.instanceOptions ? { instanceOptions: options.instanceOptions } : {}),
    instruction: {
      // The real Page, not ActionPage: navigating is this Block's job.
      act: (page: Page, _input: Checkpoint<string>, mem: MemPage) => navigate(page, mem, options),
      resolve: () => checkpoint(options.checkpoint.__state) as Out,
      ...(options.verify ? { verify: options.verify } : {}),
    },
  });
}

/**
 * A Nav or Page Block's act: go to its `url`, or click its `click` (always through a Locator, so the demo's cursor and
 * pulse show a click-nav, never a teleport). Neither: an arrival-only Page hub, already there.
 */
export async function navigate(
  page: Page,
  mem: MemPage,
  to: { url?: string | ((mem: MemPage) => string) | undefined; click?: string | ((mem: MemPage) => string) | undefined },
): Promise<void> {
  if (to.url !== undefined) await page.goto(typeof to.url === "function" ? to.url(mem) : to.url);
  else if (to.click !== undefined) await page.locator(typeof to.click === "function" ? to.click(mem) : to.click).click();
}


/**
 * Builds a {@link NavBlock}. The generated `act()` is always exactly
 * `page.goto(url)` or `page.locator(click).click()` - never anything else,
 * never author-supplied. Callers get a real `Page` here internally (the one
 * legitimate place navigation belongs); `defineBlock`'s own `ActionPage`
 * narrowing is what discourages navigation everywhere else, and never
 * applies to this generated function since no author ever writes it by
 * hand.
 * @example defineNavBlock({ name: "nav-web-login", checkpoint: "LoginForm", url: "/login" })
 * @example defineNavBlock({ name: "nav-web-request-detail", checkpoint: "RequestDetail", url: (mem) => `/dashboard/requests/${mem.get(RequestId.key)}` })
 * @example defineNavClickBlock({ name: "nav-web-documents", checkpoint: "DocumentsList", click: "nav >> text=Documents" })
 * For click-nav in app code prefer {@link defineNavClickBlock} (url stays here).
 */
export function defineNavBlock<Out extends Checkpoint<string>>(options: NavBlockOptions<Out>): NavBlock<Out> {
  const built = defineNavigating(options);
  markRoute(built, options.from?.length ? tagsOf(options.from) : ["*"], [options.checkpoint.__state]);
  // Non-enumerable so it never shows up in Object.keys/JSON/autocomplete -
  // purely a runtime marker `waygraph check` (or anything else walking a
  // project's Blocks) can test for to tell a NavBlock apart from a regular
  // one, since the TypeScript type alone (NavBlock = DefinedBlock) doesn't
  // survive to runtime.
  mark(built, "__waygraphKind", "nav");
  // Demo/step tooling: remember the click selector (or factory) so
  // overlays can label "nav click" without re-parsing source.
  if (options.from && options.from.length > 0) {
    mark(built, "__waygraphNavFrom", tagsOf(options.from));
  }
  if (options.click !== undefined) {
    mark(built, "__waygraphNavClick", options.click);
  }
  // Same idea, for the url case - only when it's a plain string (a
  // function URL is mem-dependent/dynamic, can't be compared statically
  // without running it). Real, direct request this responds to: an agent
  // driving Blind Pilot had no structured way to ask "which of the links
  // on THIS page are already covered by a NavBlock" without re-parsing
  // every nav.block.ts's own source - this is what `AutoSession` now reads
  // to warn about real, unmapped nav links found live on the page.
  if (typeof options.url === "string") {
    mark(built, "__waygraphNavUrl", options.url);
  }
  return built;
}


/**
 * Click-only {@link NavBlock}. Same runtime as {@link defineNavBlock} with
 * `click` - use this in app code so you never wonder whether a Nav is url or
 * click (no `__waygraphNavClick` sniffing at author time). Prefer
 * {@link defineNavBlock} only for `url` / `goto` deep links.
 */
export type NavClickBlockOptions<Out extends Checkpoint<string>> = {
  name: string;
  description?: string;
  /** The Checkpoint this Nav lands on: its value (`Home`). */
  checkpoint: Out;
  click: string | ((mem: MemPage) => string);
  /** Where the click can start: the Checkpoints whose page shows the link. Leave out for "from anywhere". */
  from?: readonly Checkpoint<string>[];
  requires?: readonly MemKey<unknown>[];
  verify?: Trait[] | ((out: Out) => Trait[]);
  instanceOptions?: Block<Checkpoint<string>, Out>["instanceOptions"];
};


/** A Block whose only action is clicking a link; built with `defineNavClickBlock`. */
export type NavClickBlock<Out extends Checkpoint<string>> = NavBlock<Out>;


/** @see {@link NavClickBlockOptions} */
export function defineNavClickBlock<Out extends Checkpoint<string>>(
  options: NavClickBlockOptions<Out>,
): NavClickBlock<Out> {
  return defineNavBlock<Out>({
    name: options.name,
    checkpoint: options.checkpoint,
    click: options.click,
    ...(options.from ? { from: options.from } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    ...(options.verify ? { verify: options.verify } : {}),
    ...(options.instanceOptions ? { instanceOptions: options.instanceOptions } : {}),
  });
}


/**
 * TypeScript salt over {@link defineNavBlock}: mem-picked destination
 * (which product row / which request id). Still a NavBlock / Block at runtime.
 */
export type MemNavBlock<Out extends Checkpoint<string>> = NavBlock<Out> & {
  requires: readonly MemKey<unknown>[];
  instanceOptions: NonNullable<Block<Checkpoint<string>, Out>["instanceOptions"]>;
};


/**
 * {@link defineNavBlock} constrained to mem-picked navigation: requires +
 * instanceOptions mandatory, and `click`/`url` should depend on that mem
 * (typically `click: (mem) => …`). Prefer this when the Block opens one of
 * several live rows/items rather than a fixed nav target. Still a Block.
 */
export function defineMemNavBlock<Out extends Checkpoint<string>>(
  options: NavBlockOptions<Out> & {
    requires: readonly MemKey<unknown>[];
    instanceOptions: NonNullable<Block<Checkpoint<string>, Out>["instanceOptions"]>;
  },
): MemNavBlock<Out> {
  const built = defineNavBlock<Out>(options) as MemNavBlock<Out>;
  mark(built, "__waygraphMemKind", "nav");
  return built;
}
