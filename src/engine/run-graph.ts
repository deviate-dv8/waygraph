// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { MemPage } from "../mem-page.js";
import { checkpoint } from "../types.js";
import type { Block, Checkpoint } from "../types.js";
import { runPrecondition, runVerify } from "../trait.js";
import type { Trait } from "../trait.js";
import type { BrowserContext, Locator, Page } from "@playwright/test";

/**
 * Checks `block.requires` against `mem` and throws, naming every missing key at
 * once, if any are unset. `connect()` unions each Block's `requires` into the
 * composed Block, so calling this on a `defineFlow`-built Flow's entry - which
 * `runGraph` does automatically, before opening a tab - covers every Block in
 * that flow. It does not see Blocks only reachable through `branch()` routing,
 * since those depend on a runtime decision that hasn't happened yet.
 */
export function preflight(mem: MemPage, block: Block<any, any>): void {
  const missing = (block.requires ?? []).filter((k) => !mem.has(k));
  if (missing.length > 0) {
    throw new Error(
      `preflight: MemPage is missing required key(s) before "${block.name}" can run: ${missing
        .map((k) => `"${k.name}"`)
        .join(", ")}`,
    );
  }
}


/**
 * A cross-cutting, automatically-enforced verify - the real engine
 * primitive behind "persistent UI" (a sidebar, a header, anything that's
 * supposed to be present on many/most Checkpoints, not just one page's own
 * Block). Deliberately NOT tied to any folder convention - `appliesTo`
 * matches by Checkpoint tag, explicitly, so this works the same whether a
 * project uses the Waygraph Map folder convention or the older freeform
 * "manual mode" layout real production consumers (pia-waygraph,
 * zsign-atomic-waygraph) already use - registering a Layout with an Engine
 * is the only requirement, folder structure is irrelevant to it.
 *
 * Not a Block: no `act`/`resolve`/Checkpoint of its own, never a graph
 * node - it only ever adds extra `verify` Traits to Checkpoints something
 * else already resolved to, the same way `runVerify` already runs after
 * any Block's own `resolve()` (see `runGraph`'s own verify step, just
 * below) - a Layout is that mechanism made reusable across many
 * Checkpoints instead of hand-repeated per Block.
 */
export interface Layout {
  name: string;
  description?: string;
  appliesTo: (tag: string) => boolean;
  /** Function form gets the full resolved Checkpoint, same shape `runVerify`/a Block's own `verify` already use - not just the tag. */
  verify: Trait[] | ((out: Checkpoint<string>) => Trait[]);
}


export interface LayoutOptions {
  name: string;
  description?: string;
  /** A fixed tag list, or a predicate for open-ended matching (e.g. a naming pattern). */
  appliesTo: readonly string[] | ((tag: string) => boolean);
  verify: Trait[] | ((out: Checkpoint<string>) => Trait[]);
}


/**
 * @example
 * const AppShellLayout = defineLayout({
 *   name: "app-shell",
 *   appliesTo: ["AppHome", "Chats", "Notifications", "Settings"],
 *   verify: [Trait.visible(SidebarSel.root)],
 * });
 * const engine = new Engine({ layouts: [AppShellLayout] });
 * // Now every Block resolving to one of those four Checkpoints, in any
 * // Flow this engine defines, also gets AppShellLayout's own verify run
 * // automatically - a page that silently drops the sidebar fails loud,
 * // even though no individual Block's own `verify` mentions it.
 */
export function defineLayout(options: LayoutOptions): Layout {
  const appliesTo =
    typeof options.appliesTo === "function"
      ? options.appliesTo
      : (tag: string) => (options.appliesTo as readonly string[]).includes(tag);
  return {
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    appliesTo,
    verify: options.verify,
  };
}


/**
 * Runs every registered layout whose `appliesTo(tag)` matches the just-
 * resolved Checkpoint, in registration order, right after the Block's own
 * `verify` already ran. A layout's own Trait failing throws the same way
 * any other `runVerify` failure does, naming the layout so it's clearly
 * distinguishable from the Block's own verify in the error message.
 */
async function runLayouts(
  layouts: readonly Layout[] | undefined,
  tag: string,
  out: Checkpoint<string>,
  page: Page,
  mem: MemPage,
  blockName: string,
): Promise<void> {
  if (!layouts) return;
  for (const layout of layouts) {
    if (!layout.appliesTo(tag)) continue;
    await runVerify(layout.verify, out, page, mem, `${blockName} (layout: "${layout.name}")`);
  }
}


/**
 * Runs `entry` against a fresh tab and returns the resulting terminal Checkpoint.
 * The engine owns the tab's lifecycle, not any individual Block: the tab is
 * created before the first `act` runs and closed in `finally`, so it closes even
 * if a step throws.
 *
 * After each Block resolves, its `next` (if any, from `branch()`) is followed to
 * the following Block, in the same tab - a Block with no `next` runs exactly once,
 * unchanged from before `branch()` existed. `next` returning the same Block is a
 * self-loop; `maxSteps` bounds the loop so a routing bug fails loud instead of
 * hanging.
 *
 * `terminals`, if given, is a sanity check: the Checkpoint the run stops on must be
 * one of the tags the caller actually expects, or the run fails loud instead of
 * silently returning an unexpected result. Omit it when there is only ever one
 * reachable outcome by construction (as with a `defineFlow`-built Flow, which has
 * no routing at all) - there is nothing to validate against.
 */
export async function runGraph<TOut extends Checkpoint<string>>(
  entry: Block<Checkpoint<"__start__">, TOut>,
  terminals: ReadonlySet<string> | undefined,
  context: BrowserContext,
  mem: MemPage,
  maxSteps = 5000,
  options?: RunGraphOptions,
): Promise<TOut> {
  preflight(mem, entry);
  const page = options?.page ?? (await context.newPage());
  const closeOnFinish = options?.closeOnFinish ?? true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: Block<any, any> = entry;
    let input: Checkpoint<string> = checkpoint("__start__");
    let steps = 0;

    for (;;) {
      if (++steps > maxSteps) {
        throw new Error(`runGraph: exceeded ${maxSteps} steps - check for an unintended self-loop`);
      }

      await runPrecondition(current.instruction.precondition, input, page, mem, current.name);
      await current.instruction.act(page, input, mem);
      const observed = current.instruction.observe
        ? await current.instruction.observe(page, mem)
        : undefined;
      const checkpoint = await current.instruction.resolve(observed);

      await runVerify(current.instruction.verify, checkpoint, page, mem, current.name);
      await runLayouts(options?.layouts, checkpoint.__state, checkpoint, page, mem, current.name);

      const next = current.next?.(checkpoint);
      if (!next) {
        if (terminals && !terminals.has(checkpoint.__state)) {
          throw new Error(
            `runGraph: "${current.name}" resolved to "${checkpoint.__state}", which is not a registered terminal (expected one of: ${[...terminals].join(", ")})`,
          );
        }
        return checkpoint as TOut;
      }

      current = next;
      input = checkpoint;
    }
  } finally {
    if (closeOnFinish) {
      await page.close();
    }
  }
}


/** Options for `runGraph`'s trailing `options` arg and for {@link Flow.run}'s `options` overload. */
export interface RunGraphOptions {
  /**
   * Drive this already-open page instead of opening a new one via
   * `context.newPage()`. Lets a run continue on a tab the caller already
   * has open (e.g. one that's already logged in), instead of every run
   * being forced to start its own fresh tab and lose access to whatever was
   * already there.
   */
  page?: Page;
  /**
   * `Flow.run` defaults this to `true` only when it opened the page itself
   * (no `page` given) - matching every call from before this option
   * existed. If you pass your own `page`, it defaults to `false` instead:
   * a page you opened is yours to close, not this run's to close out from
   * under you. Either way an explicit value here always wins. `runGraph`
   * itself has no such page-aware default (its caller already decided
   * `page` and `closeOnFinish` together) - it just does what you ask.
   */
  closeOnFinish?: boolean;
  /**
   * Layouts (see {@link defineLayout}) whose `verify` runs automatically
   * after any Block in this run resolves to a Checkpoint they apply to -
   * `Flow.run` threads this in from `EngineConfig.layouts` by default; pass
   * it directly here to call `runGraph` standalone (outside a `Flow`) with
   * layouts still enforced.
   */
  layouts?: readonly Layout[];
}


/**
 * Drives a genuinely separate second tab through its own Block/Flow, in the
 * same browser context an existing `page` already belongs to - the primitive
 * `observe()` is specifically allowed to reach for (see {@link Instruction.observe}),
 * since `act`/`resolve` can't touch `page.context()` at all. A thin, named
 * wrapper around `runGraph` (which already opens its own page from whatever
 * context it's given) rather than a new mechanism - the point is making the
 * pattern discoverable and giving it a real name, not inventing new tab-lifecycle
 * logic. The spawned tab is closed (by `runGraph`'s own `finally`) before this
 * resolves; the original `page` is never touched.
 * @example
 * async observe(page, mem) {
 *   const receipt = await spawnTab(EmailReceiptFlow, page, mem);
 *   mem.set(ReceiptCode, receipt.__state);
 * }
 */
export async function spawnTab<TOut extends Checkpoint<string>>(
  entry: Block<Checkpoint<"__start__">, TOut>,
  page: Page,
  mem: MemPage,
  maxSteps = 5000,
): Promise<TOut> {
  return runGraph<TOut>(entry, undefined, page.context(), mem, maxSteps);
}


/**
 * Wraps one `act()` interaction with a caption and highlight, for a Block
 * author who wants to explicitly narrate a specific step rather than rely
 * on the generic per-fill/per-click narration `waygraph chain
 * WAYGRAPH_STEP=1` already does automatically -
 * `await narrate(submitButton, "confirms the order", () => submitButton.click())`
 * reads at the call site instead of being inferred.
 *
 * A true no-op everywhere except inside a `WAYGRAPH_STEP=1` run: it checks
 * for a `window.__wgPositionRing` hook the step-mode overlay installs on
 * the page before doing anything, so a headless/CI/automated run (nobody
 * watching, per-character delays and highlight pauses would just be wasted
 * time) pays zero extra cost - not even the boundingBox() lookup runs. The
 * `action` itself always runs regardless; only the narration is
 * conditional.
 * @example await narrate(submitButton, "confirms the order", () => submitButton.click())
 */
export async function narrate<T>(
  locator: Locator,
  caption: string,
  action: () => Promise<T>,
): Promise<T> {
  const page = locator.page();
  const active = await page
    .evaluate(() => typeof (globalThis as unknown as { __wgPositionRing?: unknown }).__wgPositionRing === "function")
    .catch(() => false);
  if (!active) return action();
  let owning = false;
  try {
    const box = await locator.boundingBox();
    if (box) {
      await page
        .evaluate(
          ({ box, caption }) => {
            const w = globalThis as unknown as {
              __wgPositionRing?: (box: unknown, label: string, tone?: string) => void;
              __wgLastNarrate?: number;
              __wgNarrateOwnsRing?: boolean;
            };
            if (w.__wgPositionRing) w.__wgPositionRing(box, caption, "planned");
            // The CLI's own automatic per-fill/per-click narration checks
            // this before showing (and overwriting) its own guess - an
            // explicitly authored caption should win, not get immediately
            // replaced a moment later by the generic one.
            w.__wgLastNarrate = Date.now();
            // Also claim the ring itself: the auto-highlight click/fill
            // patches each hide the ring right after THEIR own step
            // finishes, which - if action() below does more than one thing
            // (e.g. a click then a wait for a toast) - would wipe this
            // caption after just the first sub-step instead of the whole
            // narrated action. Their hideRing() calls no-op while this is
            // true; narrate() below is the one that actually clears it.
            w.__wgNarrateOwnsRing = true;
          },
          { box, caption },
        )
        .catch(() => {});
      owning = true;
      // The ring alone is pointless if action() fires on the very next
      // tick - a click that navigates (e.g. a form submit) wipes the ring
      // before a human can read the caption at all. Give it the same
      // "pop for a few seconds" dwell as the CLI's own auto-highlight
      // clicks before the real action runs.
      await new Promise((resolve) => setTimeout(resolve, 650));
      // Re-stamp __wgLastNarrate right before handing off to action() - the
      // CLI's auto-highlight patches only treat a narrate() as "just
      // handled" within a short window (500ms), which the dwell above
      // already burned through. Without this, action()'s own click/fill
      // (same patched Locator prototype) would stomp this caption with its
      // own generic one a moment after it finally became visible.
      await page
        .evaluate(() => {
          (globalThis as unknown as { __wgLastNarrate?: number }).__wgLastNarrate = Date.now();
        })
        .catch(() => {});
    }
  } catch {
    // best-effort - the real action below still runs either way
  }
  try {
    return await action();
  } finally {
    if (owning) {
      await page
        .evaluate(() => {
          const w = globalThis as unknown as {
            __wgNarrateOwnsRing?: boolean;
            __wgHideRing?: () => void;
          };
          w.__wgNarrateOwnsRing = false;
          if (w.__wgHideRing) w.__wgHideRing();
        })
        .catch(() => {});
    }
  }
}


/** Reserved markers bookending a `defineFlow([start, ...blocks, end])` call. */
export const start = Symbol("waygraph.start");

export const end = Symbol("waygraph.end");

export type StartMarker = typeof start;

export type EndMarker = typeof end;
