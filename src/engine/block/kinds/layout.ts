// A layout: what many pages share (a sidebar, a top bar, breadcrumbs, a user menu), the way front-end frameworks wrap the
// pages under a route folder. Declared once in a `_layout.block.ts`; it covers every page in its folder and below. A hub
// like a Page Block, not a step of its own: its links are Navs, its actions Methods, what it shows a Read Block.
import type { Page } from "@playwright/test";
import { mark } from "../mark.js";
import { markFor } from "../access.js";
import { defineBlock } from "../block.js";
import type { DefinedBlock } from "../block.js";
import { checkpoint, type Checkpoint } from "../../checkpoint/checkpoint.js";
import { markRoute } from "../../checkpoint/route.js";
import type { Trait } from "../../trait/trait.js";
import type { MemPage } from "../../mem/mem.js";
import { defineReadBlock, type ReadBlock } from "../../read/read-block.js";
import type { ReadCtx } from "../../read/readers.js";
import { readKeys, type PageRead, type PageReadKeys } from "../../read/read-keys.js";
import type { Account } from "../../flow/account.js";
import { navigate, type NavBlock } from "./nav.js";
import type { PageMethodEntry, PageMethods } from "./page.js";

/** A link in a layout: where it leads (a page, or `"parent"`: the page above, in the site map), and how it's clicked. */
export interface LayoutLink {
  to: Checkpoint<string> | "parent";
  click: string | ((mem: MemPage) => string);
  /** The accounts that see it; without it, every account. */
  for?: readonly Account[];
  description?: string;
  /** Checks on arrival, over the landing on `to`. */
  verify?: Trait[];
}

export interface LayoutOptions<G extends Record<string, LayoutLink>, D extends Record<string, PageMethodEntry>, R extends PageRead = PageRead> {
  name: string;
  description?: string;
  /** Its links, by name: `Layout.go.<name>`, Navs valid on every page it covers. */
  go?: G;
  /** Its actions, by name: `Layout.do.<name>`, Methods (or `() => Method`, lazy) valid on every page it covers. */
  do?: D;
  /** What it shows, read on every page it covers: a reader per field, like a page's `read`. Its keys are `Layout.read.<field>`. */
  read?: (ctx: ReadCtx) => R;
  /** The name run logs and `waygraph pilot read` give what it reads (`sidebar.links`); the layout's name unless given. */
  readAs?: string;
  /** The pages it covers, when they aren't the ones under its folder (an app whose layout doesn't follow its addresses). */
  on?: readonly Checkpoint<string>[];
  /**
   * The button that opens it, for a layout that hides its links until opened (a burger menu, a user dropdown): a link
   * clicks it first when its own link isn't showing.
   */
  opens?: string;
}

/** A link's Nav: lands on its page, or on the page above for `to: "parent"`. */
export type LinkNav<L extends LayoutLink> = L["to"] extends Checkpoint<string> ? NavBlock<L["to"]> : NavBlock<Checkpoint<string>>;

export interface Layout<G extends Record<string, LayoutLink>, D extends Record<string, PageMethodEntry>, R extends PageRead = Record<never, never>> {
  readonly name: string;
  readonly description: string;
  /** Its links as Navs, by name: `gotoPage(Sidebar.go.equipment)`. */
  readonly go: { readonly [K in keyof G]: LinkNav<G[K]> };
  /** Its actions as Methods, by name: `.method(TopBar.do.signOut)`. */
  readonly do: PageMethods<D>;
  /** What it shows, when it says. */
  /** The keys of what it shows, to check by: `Layout.read.links.is([...])`. */
  readonly read: PageReadKeys<R>;
  /** The Read Block that reads it. */
  readonly readBlock: ReadBlock | undefined;
  /** Who's given each link (`for`), by name: what the access tests and `waygraph check` read. An action's is its Method's. */
  readonly access: Readonly<Record<string, readonly string[] | undefined>>;
  /** The pages it was given with `on`, if any. */
  readonly on: readonly string[] | undefined;
  /** The button that shows its links, for a layout that hides them (`opens`). */
  readonly opens: string | undefined;
}

/** What a layout knows once layouts are loaded: the pages it covers, and the page above each. Shared by name. */
export interface LayoutState {
  covers: string[];
  parents: Record<string, string>;
  /** False until `loadLayouts` set it: then a link runs anywhere, unchecked (a spec that loaded no layouts). */
  loaded: boolean;
}

/**
 * Each layout's state, by name: a project file can be imported twice (a run imports a file fresh), and every copy of a
 * layout must see what loading found. On globalThis: src and dist, or two installs, can load in one process.
 */
const states: Map<string, LayoutState> = ((globalThis as { [k: symbol]: Map<string, LayoutState> | undefined })[
  Symbol.for("waygraph.layouts")
] ??= new Map());

/** The state of the layout called `name` (made the first time it's asked for). */
export function layoutState(name: string): LayoutState {
  let state = states.get(name);
  if (!state) {
    state = { covers: [], parents: {}, loaded: false };
    states.set(name, state);
  }
  return state;
}

/** A layout link's check before it clicks: the page the flow is on is one the layout covers. */
function coveredOn(layout: string, link: string): (input: Checkpoint<string>) => Trait[] {
  return (input) => {
    const state = layoutState(layout);
    if (!state.loaded || state.covers.includes(input.__state)) return [];
    return [
      {
        name: `on-${layout}`,
        wants: `a page ${layout} is on (${state.covers.join(", ") || "none"})`,
        async check() {
          return { ok: false, saw: `${input.__state}: ${layout} isn't on it, so ${layout} › ${link} can't be clicked there` };
        },
        timeoutMs: 0,
      },
    ];
  };
}

/**
 * Whether the link at `selector` is showing: visible and inside the window. A closed slide-out menu keeps its links
 * visible, off to the side.
 */
export async function linkShowing(page: Page, selector: string): Promise<boolean> {
  const link = page.locator(selector).first();
  if (!(await link.isVisible())) return false;
  return link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  });
}

/** The page each `to: "parent"` link will land on, by page: set as it acts (resolve sees only what observe gives it). */
const goingUp = new WeakMap<Page, string>();

function linkNav(layout: string, key: string, link: LayoutLink, opens: string | undefined): DefinedBlock<Checkpoint<string>, Checkpoint<string>> {
  const name = `${layout}-${key}`;
  const description = link.description ?? (link.to === "parent" ? `Clicks ${layout}'s ${key}: up to the page above.` : `Clicks ${layout}'s ${key}.`);
  const parent = link.to === "parent";
  const target = link.to === "parent" ? undefined : link.to;
  const built = defineBlock<Checkpoint<string>, Checkpoint<string>>({
    name,
    description,
    instruction: {
      precondition: coveredOn(layout, key),
      async act(page: Page, input: Checkpoint<string>, mem: MemPage) {
        if (parent) {
          const up = layoutState(layout).parents[input.__state];
          if (!up) throw new Error(`${name}: ${input.__state} has no page above it in the site map`);
          goingUp.set(page, up);
        }
        // A menu that hides its links: opened first when this one isn't showing.
        const selector = typeof link.click === "function" ? link.click(mem) : link.click;
        if (opens && !(await linkShowing(page, selector))) await page.locator(opens).click();
        await navigate(page, mem, { click: link.click });
      },
      ...(parent ? { observe: async (page: Page) => goingUp.get(page) } : {}),
      resolve: (observed: unknown) => checkpoint(parent ? String(observed) : (target as Checkpoint<string>).__state),
      ...(link.verify ? { verify: link.verify } : {}),
    },
  });
  // From any page (the check before it clicks says which); to its page, or, going up, to every page that is a parent
  // (known once layouts are loaded, and the same for every copy of the layout).
  markRoute(built, ["*"], target ? [target.__state] : []);
  // Once layouts are loaded, it runs from the pages the layout covers: route finding (auto, traverse) plans with them.
  Object.defineProperty(built, "__waygraphFrom", {
    get: () => (layoutState(layout).loaded ? [...layoutState(layout).covers] : ["*"]),
    enumerable: false,
    configurable: true,
  });
  if (parent) {
    Object.defineProperty(built, "__waygraphTo", {
      get: () => [...new Set(Object.values(layoutState(layout).parents))].sort(),
      enumerable: false,
      configurable: true,
    });
  }
  mark(built, "__waygraphKind", "nav");
  mark(built, "__waygraphNavClick", link.click);
  mark(built, "__waygraphLayout", { layout, link: key, parent });
  markFor(built, link.for);
  return built;
}

/**
 * A layout: the UI many pages share. In `src/map/<folder>/_layout.block.ts` it covers every page in that folder and
 * below (nested layouts stack); `on` names the pages instead.
 * @example
 * export const Sidebar = defineLayout({
 *   name: "sidebar",
 *   go: {
 *     plan: { to: ProductionPlan, click: SidebarSel.plan },
 *     equipment: { to: EquipmentRegistry, click: SidebarSel.equipment, for: [PlantManager] },
 *   },
 *   read: (ctx) => ({ links: ctx.page.texts(SidebarSel.link) }),
 * });
 * engine.map({ as: PlantManager }).gotoPage(Sidebar.go.equipment)
 */
export function defineLayout<G extends Record<string, LayoutLink> = Record<never, never>, D extends Record<string, PageMethodEntry> = Record<never, never>, R extends PageRead = Record<never, never>>(
  options: LayoutOptions<G, D, R>,
): Layout<G, D, R> {
  const go = Object.fromEntries(Object.entries(options.go ?? {}).map(([key, link]) => [key, linkNav(options.name, key, link, options.opens)]));
  // Actions resolve when first used: a Method file may import its layout.
  const actions = options.do ?? ({} as D);
  const doRecord = {} as Record<string, unknown>;
  for (const [key, entry] of Object.entries(actions)) {
    Object.defineProperty(doRecord, key, { enumerable: true, get: () => (typeof entry === "function" ? entry() : entry) });
  }
  const namespace = options.readAs ?? options.name;
  const readOf = options.read;
  const read = readOf
    ? defineReadBlock({
        name: `read-${options.name}`,
        description: `What ${options.name} shows, on every page it covers.`,
        // Read on every page until loading says which it covers.
        instruction: { read: (ctx) => ({ namespace, fields: readOf(ctx) }) },
      })
    : undefined;
  const accounts = (list: readonly Account[] | undefined) => list?.map((a) => a.name);
  const access: Record<string, readonly string[] | undefined> = Object.fromEntries(
    Object.entries(options.go ?? {}).map(([key, link]) => [key, accounts(link.for)]),
  );
  const state = layoutState(options.name);
  // Its Read reads the pages it covers once layouts are loaded (every page until then), for every copy of the layout.
  if (read) Object.defineProperty(read, "from", { get: () => (state.loaded ? state.covers : ["*"]), enumerable: true, configurable: true });
  const layout = {
    name: options.name,
    description: options.description ?? "",
    go,
    do: doRecord,
    read: readKeys(namespace),
    readBlock: read,
    access,
    on: options.on?.map((c) => c.__state),
    opens: options.opens,
  };
  mark(layout, "__waygraphLayout", true);
  return layout as unknown as Layout<G, D, R>;
}

/** Whether `value` is a layout `defineLayout` made. */
export function isLayout(value: unknown): value is Layout<Record<string, LayoutLink>, Record<string, PageMethodEntry>> {
  return typeof value === "object" && value !== null && (value as { __waygraphLayout?: unknown }).__waygraphLayout === true;
}
