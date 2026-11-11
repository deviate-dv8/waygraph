// Which page a step acts on. A flow with panes (`map({ panes })`, `.in(pane)`) plays each step on its pane's page, from
// where that pane last landed; every other step plays on the page the run was given. The panes themselves (contexts,
// sign-ins, closing) are flow/panes.ts, which installs itself here: the run loop only asks.
import type { Browser, Page } from "@playwright/test";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemPage } from "../mem/mem.js";

/** A step's pane: its name, and the flow's panes it is one of (the same object for every step of the flow). */
export interface PaneMark {
  name: string;
  panes: object;
}

/** What the panes give a step. */
export interface PaneResolver {
  /** The page a step in `pane` acts on, opening the pane on first use; `page` is any page of the run. */
  page(pane: PaneMark, page: Page, mem: MemPage): Promise<Page>;
  /** The step's input: where its pane last landed (`Start` the first time), or `given` outside a run with panes. */
  input(pane: PaneMark, page: Page, given: Checkpoint<string>): Checkpoint<string>;
  /** The step in `pane` landed on `at`. */
  landed(pane: PaneMark, page: Page, at: Checkpoint<string>): void;
  /** Closes the panes the run on `page` opened. */
  close(page: Page): Promise<void>;
}

/**
 * What shows a run's panes (the demo's stage): where their contexts are made (a browser that isn't the one the stage is
 * in), each pane's size, and word of each pane as it opens and as it starts acting. With a host, no pane plays on the
 * run's own page: that page is the stage.
 */
export interface PaneHost {
  browser: Browser;
  /** The size of a pane with no device of its own. */
  viewport(pane: string): { width: number; height: number };
  /** A pane's page opened: `label` says who is signed in there and its device. */
  opened(pane: string, page: Page, label: string): Promise<void>;
  /** The pane the next step acts in. */
  acting(pane: string): void;
  /** More options for a pane's own context (a video of it; a window-sized page). */
  contextOptions?(pane: string): Record<string, unknown>;
}

const hosts = ((globalThis as { [k: symbol]: WeakMap<Page, PaneHost> | undefined })[Symbol.for("waygraph.paneHosts")] ??= new WeakMap());

/** The run on `page` shows its panes with `host`. */
export function setPaneHost(page: Page, host: PaneHost): void {
  hosts.set(page, host);
}

/** The host showing the panes of the run on `page`, if one does. */
export function paneHostOf(page: Page): PaneHost | undefined {
  return hosts.get(page);
}

const slot = ((globalThis as { [k: symbol]: { resolver?: PaneResolver } | undefined })[Symbol.for("waygraph.paneResolver")] ??= {});

/** Installs the panes (flow/panes.ts does, when it loads). */
export function setPaneResolver(resolver: PaneResolver): void {
  slot.resolver = resolver;
}

/** The pane a step plays in, when it has one (a joined step: its last step's). */
export function paneOf(block: object): PaneMark | undefined {
  return (block as { __waygraphPane?: PaneMark }).__waygraphPane;
}

/** The page `block` acts on: its pane's, or `page`. */
export async function stepPage(block: object, page: Page, mem: MemPage): Promise<Page> {
  const pane = paneOf(block);
  return pane && slot.resolver ? slot.resolver.page(pane, page, mem) : page;
}

/** The input `block` starts from: where its pane last landed, or `given`. */
export function stepInput(block: object, page: Page, given: Checkpoint<string>): Checkpoint<string> {
  const pane = paneOf(block);
  return pane && slot.resolver ? slot.resolver.input(pane, page, given) : given;
}

/** `block` landed on `at`: its pane remembers it. */
export function stepLanded(block: object, page: Page, at: Checkpoint<string>): void {
  const pane = paneOf(block);
  if (pane && slot.resolver) slot.resolver.landed(pane, page, at);
}

/** Closes the panes a run opened, if any. */
export async function closePanes(page: Page): Promise<void> {
  await slot.resolver?.close(page);
}

/** The pane a step plays in, by name: the run log's `pane`. */
export function paneName(block: object): string | undefined {
  return paneOf(block)?.name;
}

/** A step's name as errors say it: with its pane and who's signed in there, `approve (in admin, as admin)`. */
export function stepLabel(block: { name: string }): string {
  const pane = paneOf(block);
  if (!pane) return block.name;
  const as = (pane.panes as Record<string, { as?: { name: string } } | undefined>)[pane.name]?.as;
  return `${block.name} (in ${pane.name}${as ? `, as ${as.name}` : ""})`;
}
