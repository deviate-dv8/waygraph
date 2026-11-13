// Panes: a flow that plays on more than one page at once (`map({ panes })`, `.in(pane)`): two people side by side, or
// one person with the app and a helper (a mail catcher). Each pane is a page in its own browser context (its own
// cookies, its own signed-in person, its own device), or another page in a pane's context (`with`). A pane opens when a
// step first acts in it and closes when the flow ends. The run loop asks which page a step acts on (run/pane-page.ts);
// this answers.
import type { BrowserContext, Page } from "@playwright/test";
import { Start, type Checkpoint } from "../checkpoint/checkpoint.js";
import { envString } from "../env.js";
import { mark } from "../block/mark.js";
import { copyWaygraphRuntime } from "../block/block.js";
import type { SomeBlock } from "../block/some-block.js";
import type { MemPage } from "../mem/mem.js";
import { WaygraphError } from "../errors.js";
import { paneHostOf, setPaneResolver, type PaneMark, type PaneResolver } from "../run/pane-page.js";
import { stepEnded, stepStarted } from "../run/events.js";
import { resolveDevice, type Device } from "./device.js";
import { signInStep, type Account } from "./account.js";
import { setStates } from "../mem/state.js";
import { clearSessionState } from "./flow.js";
import { ignorePageGone } from "../page-gone.js";

/**
 * A pane of a flow: a value, like an account or a page, declared once (`const Guest = pane("guest", { as: ProblemUser })`)
 * and named in `map({ panes: [Main, Guest] })`, `.in(Guest)` and `.close(Guest)`: renamed and found everywhere at once,
 * and shared between flows.
 */
export interface Pane<N extends string = string> {
  readonly name: N;
  readonly options: PaneOptions;
}

/** Declares a pane: a name (how the demo and the run log call it) and where and as whom it plays. */
export function pane<N extends string>(name: N, options: PaneOptions = {}): Pane<N> {
  return { name, options };
}

/** How a pane plays. */
export interface PaneOptions {
  /** Who is signed in here: the account's session, kept or new, before the pane's first step. */
  as?: Account;
  /** The device this pane plays on (a pane with its own context is that device: its size, layout and touch). */
  device?: Device;
  /** Another pane whose context this one shares: one person, a second page (the app and the mail catcher). */
  with?: Pane;
  /** The site this pane's relative addresses are on, when it isn't the run's (another environment: staging and prod). */
  baseUrl?: string;
}

/** A pane as the run holds it: `with` by name. */
export interface PaneConfig extends Omit<PaneOptions, "with"> {
  with?: string;
}

/** A flow's panes, by name. */
export type Panes = Readonly<Record<string, PaneConfig>>;

/** The panes of `map({ panes })` as the run holds them. */
export function panesRecord(list: readonly Pane[]): Panes {
  const record: Record<string, PaneConfig> = {};
  for (const { name, options } of list) {
    const { with: shared, ...rest } = options;
    record[name] = shared ? { ...rest, with: shared.name } : rest;
  }
  return record;
}

/** The panes of one run: each pane's page, where it last landed, and the contexts the run opened for them. */
interface PaneTable {
  readonly panes: Panes;
  /** The page the run was given: the first pane's, or, with a host, the stage. */
  readonly home: Page;
  readonly pages: Map<string, Page>;
  readonly last: Map<string, Checkpoint<string>>;
  readonly contexts: BrowserContext[];
  /** The context each pane with its own was given, by pane. */
  readonly own: Map<string, BrowserContext>;
  active: string | undefined;
  /** A pane's sign-in is playing: its own flow ends without closing the panes it plays in. */
  signingIn: boolean;
}

/** Each run's panes, by every page of the run: a step finds its run's panes from whichever of its pages it was given. */
const tables: WeakMap<Page, PaneTable> = ((globalThis as { [k: symbol]: WeakMap<Page, PaneTable> | undefined })[
  Symbol.for("waygraph.paneTables")
] ??= new WeakMap());

/** Checks a flow's panes when it's built: a `with` names another pane that has a context of its own. */
export function checkPanes(panes: Panes): void {
  for (const [name, pane] of Object.entries(panes)) {
    if (pane.with === undefined) continue;
    const base = panes[pane.with];
    if (!base) throw new WaygraphError("WG_PANES", `pane "${name}" is with "${pane.with}", which isn't one of this flow's panes (${Object.keys(panes).join(", ")})`);
    if (base.with !== undefined) throw new WaygraphError("WG_PANES", `pane "${name}" is with "${pane.with}", which is itself with "${base.with}": name the pane with the context`);
    if (pane.as) throw new WaygraphError("WG_PANES", `pane "${name}" shares "${pane.with}"'s context, so it's signed in as whoever "${pane.with}" is: drop its as`);
  }
}

/** The same step, played in `pane` of `panes`. Keeps the Block's markers. */
export function inPane(block: SomeBlock, pane: string, panes: Panes): SomeBlock {
  const next: SomeBlock = { ...block };
  copyWaygraphRuntime(block, next);
  mark(next, "__waygraphPane", { name: pane, panes } satisfies PaneMark);
  return next;
}

/** Opens `name`'s page: the run's own page for the first pane used, a page in a shared or new context for the rest. */
async function open(table: PaneTable, name: string, home: Page, mem: MemPage): Promise<Page> {
  const pane = table.panes[name];
  if (!pane) throw new WaygraphError("WG_PANES", `no pane "${name}" in this flow (${Object.keys(table.panes).join(", ")})`);
  const host = paneHostOf(table.home);
  let page: Page;
  if (pane.with !== undefined) {
    page = await (await pageOf(table, pane.with, home, mem)).context().newPage();
    const device = table.panes[pane.with]?.device;
    if (host) await page.setViewportSize(device ? resolveDevice(device).viewport : host.viewport(name));
  } else if (!host && ![...table.pages.values()].includes(home)) {
    // A pane plays on the page the run was given when no other does (the first to open; one that opens after it closed).
    // With a host, that page is the stage.
    page = home;
    if (pane.device) await page.setViewportSize(resolveDevice(pane.device).viewport);
  } else {
    const browser = host?.browser ?? home.context().browser();
    if (!browser) {
      throw new WaygraphError("WG_PANES", `pane "${name}" needs a browser context of its own, and this run's browser can't make one (a persistent context, as with extensions): give it with: "<pane>" to share one`);
    }
    const device = pane.device ? resolveDevice(pane.device) : undefined;
    const baseURL = pane.baseUrl ?? envString("WAYGRAPH_BASE_URL");
    const options = {
      ...(baseURL ? { baseURL } : {}),
      ...(device
        ? { viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor, isMobile: device.isMobile, hasTouch: device.hasTouch }
        : { viewport: host?.viewport(name) ?? home.viewportSize() ?? { width: 1280, height: 720 } }),
      ...host?.contextOptions?.(name),
    };
    const context = host?.newContext ? await host.newContext(name, options) : await browser.newContext(options);
    table.contexts.push(context);
    table.own.set(name, context);
    page = await context.newPage();
  }
  if (host) await host.opened(name, page, labelOf(table.panes, name));
  table.pages.set(name, page);
  tables.set(page, table);
  if (pane.as) {
    // Signed in before the pane's first step, as a step of its own in the run log.
    const step = signInStep(pane.as);
    stepStarted(step.name, "method", Start.__state, undefined, name);
    table.signingIn = true;
    try {
      await step.instruction.act(page, Start, mem);
    } finally {
      table.signingIn = false;
    }
    stepEnded(step.name, Start.__state, page.url());
  }
  return page;
}

/** Who is in a pane and on what, for the stage: `as planner · phone`. */
function labelOf(panes: Panes, name: string): string {
  const pane = panes[name];
  const owner = pane?.with !== undefined ? panes[pane.with] : pane;
  const parts = [owner?.as ? `as ${owner.as.name}` : "", pane?.device !== undefined || owner?.device !== undefined ? resolveDevice((pane?.device ?? owner?.device) as Device).preset : ""];
  // A pane named for what it is (a compared device) doesn't say it twice.
  return parts.filter((part) => part && part !== name && part !== `as ${name}`).join(" · ");
}

async function pageOf(table: PaneTable, name: string, home: Page, mem: MemPage): Promise<Page> {
  return table.pages.get(name) ?? open(table, name, home, mem);
}

/** Gives the run loop its panes: `map({ panes })` calls it, so a flow with none never loads them. */
export function installPanes(): void {
  setPaneResolver(resolver);
}

const resolver: PaneResolver = {
  async page(pane, page, mem) {
    const panes = pane.panes as Panes;
    let table = tables.get(page);
    // Another flow's panes on this page (a chain of flows on one page) end where that flow did.
    if (table && table.panes !== panes) await resolver.close(page);
    if (!table || table.panes !== panes) {
      table = { panes, home: page, pages: new Map(), last: new Map(), contexts: [], own: new Map(), active: undefined, signingIn: false };
      tables.set(page, table);
    }
    const target = await pageOf(table, pane.name, page, mem);
    // Back in a pane: its person's own data again (their email, their credentials), over the other pane's.
    if (table.active !== pane.name) {
      table.active = pane.name;
      paneHostOf(table.home)?.acting(pane.name);
      const who = panes[pane.name]?.as;
      who?.mem?.(mem);
      // The person's states are theirs alone: a pane signed in is not the other pane signed in.
      if (who?.mem) setStates(who.mem, mem, pane.name);
    }
    return target;
  },
  input(pane, page, given) {
    const table = tables.get(page);
    // A pane's first step starts where a new flow does (its sign-in brings it back there), not where another pane is.
    return table ? (table.last.get(pane.name) ?? Start) : given;
  },
  landed(pane, page, at) {
    tables.get(page)?.last.set(pane.name, at);
  },
  async closeOne(name, page) {
    const table = tables.get(page);
    const open = table?.pages.get(name);
    if (!table || !open) return;
    // Its own context goes, with every pane sharing it; a pane sharing another's loses its page only.
    const sharing = [name, ...Object.entries(table.panes).filter(([, p]) => p.with === name).map(([other]) => other)];
    const host = paneHostOf(table.home);
    for (const pane of sharing) {
      const p = table.pages.get(pane);
      if (!p) continue;
      table.pages.delete(pane);
      table.last.delete(pane);
      if (p === table.home) {
        // The run's own page stays open: the pane's person leaves it (cookies and storage cleared), as a closed context
        // would, and it's free for the next pane to open.
        await clearSessionState(p.context(), p);
        await p.goto("about:blank").catch(ignorePageGone);
      } else {
        tables.delete(p);
        if (!table.own.has(pane)) await p.close();
      }
      if (table.active === pane) table.active = undefined;
      host?.closed?.(pane);
    }
    const context = table.own.get(name);
    if (context) {
      table.own.delete(name);
      table.contexts.splice(table.contexts.indexOf(context), 1);
      await context.close();
    }
  },
  async close(page) {
    const table = tables.get(page);
    if (!table || table.signingIn) return;
    for (const p of table.pages.values()) tables.delete(p);
    for (const context of table.contexts) await context.close();
  },
};
