// A Block's screenshot (`screenshot: true`), taken once its step is done; on a Page Block, once any step lands on its page.
// The engine doesn't know where a project keeps its files, so whoever does (the run log, runtime/run-log.ts) registers a
// keeper; with none, nothing is taken.
import type { Page } from "@playwright/test";

/** One screenshot to keep: the page, the step it ends, and the Checkpoint the page is at. */
export interface StepShot {
  page: Page;
  block: string;
  checkpoint: string;
  fullPage: boolean;
}

type Keeper = (shot: StepShot) => Promise<void>;

/** The registered keeper. On globalThis: src and dist, or two installs, can run in one process. */
const KEEPER = Symbol.for("waygraph.screenshotKeeper");
const slot = globalThis as { [KEEPER]?: Keeper };

/** The pages whose Page Block asks for a screenshot (`definePageBlock({ screenshot })`), by Checkpoint tag. */
const PAGES = Symbol.for("waygraph.screenshotPages");
const pages = ((globalThis as { [PAGES]?: Map<string, { fullPage?: boolean }> })[PAGES] ??= new Map());

/** A Page Block's screenshot: every step that lands on its page takes one. */
export function screenshotPage(checkpoint: string, options: { fullPage?: boolean }): void {
  pages.set(checkpoint, options);
}

/** Registers what keeps a Block's screenshots (the run log does); a second call replaces the first. */
export function keepScreenshots(keeper: Keeper): void {
  slot[KEEPER] = keeper;
}

/**
 * Takes the step's screenshot when its Block asks for one, or the page it landed on does (its Page Block), and something
 * keeps them; `name` is the step's (inside a chain of Blocks, the last real one's). Never fails the step.
 */
export async function screenshotStep(page: Page, block: object, checkpoint: string, name = (block as { name: string }).name): Promise<void> {
  const wants = (block as { __waygraphScreenshot?: { fullPage?: boolean } }).__waygraphScreenshot ?? pages.get(checkpoint);
  const keeper = slot[KEEPER];
  if (!wants || !keeper) return;
  try {
    await keeper({ page, block: name, checkpoint, fullPage: !!wants.fullPage });
  } catch {
    // A screenshot is a record of the step, not part of it: a page that closed or a disk that's full doesn't fail it.
  }
}
