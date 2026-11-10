// Runs a Block's Traits: after resolve (verify) and before act (precondition). A check that doesn't wait is retried until
// it passes or its time runs out, so a page still settling doesn't fail it; a failure says what the check wanted, what the
// page showed and where, as one sentence and as data (on the run's step:error event).
import { setTimeout as sleep } from "node:timers/promises";
import type { Page } from "@playwright/test";
import type { MemPage } from "../mem/mem.js";
import type { Trait, TraitResult } from "./trait.js";

/** How long verify keeps retrying a check that doesn't pass, unless the Trait says otherwise. */
const DEFAULT_TIMEOUT_MS = 5000;
const RETRY_EVERY_MS = 200;

/** What a failed check reports: its name, the Block, what it wanted and saw, and the page it was on. */
export interface TraitCheckReport {
  trait: string;
  block: string;
  /** "after": the Block's verify; "before": its precondition; "expect": one of the step's expectations. */
  when: "after" | "before" | "expect";
  wants?: string;
  saw?: string;
  url?: string;
  heading?: string;
}

/** Marks an error that already names its step (a failed check, an expectation): an act error isn't wrapped around it. */
export const NAMES_ITS_STEP = Symbol.for("waygraph.namesItsStep");

/**
 * The step a failure is about, and the chain it ran in: a Block built from several (`ff-1 -> add-to-cart -> ... ->
 * finish-order`) failed at its last one; a long chain is shown by its ends.
 */
export function stepAndChain(block: string): { step: string; chain?: string } {
  const parts = block.split(" -> ");
  const step = parts[parts.length - 1] ?? block;
  if (parts.length < 2) return { step };
  const shown = parts.length > 4 ? [parts[0], parts[1], "…", step] : parts;
  return { step, chain: `${shown.join(" → ")} (${parts.length} steps)` };
}

/** Where the page was, for a failure's `on` line: its address and first heading. */
export function pageLine(check: Pick<TraitCheckReport, "url" | "heading">): string | undefined {
  return check.url ? `${check.url}${check.heading ? ` ("${check.heading}")` : ""}` : undefined;
}

/** Lines of a failure, labelled and aligned: `  wanted  6 products`. */
export function labelled(rows: readonly [string, string | undefined][]): string {
  return rows.flatMap(([label, value]) => (value ? [`  ${label.padEnd(6)}  ${value}`] : [])).join("\n");
}

/**
 * A Trait that didn't pass. `message` names the step first, then what the check wanted, what the page showed and where,
 * one to a line; `check` is the same as data.
 */
export class TraitFailure extends Error {
  constructor(readonly check: TraitCheckReport) {
    const { step, chain } = stepAndChain(check.block);
    const when = check.when === "before" ? " before it acted" : "";
    const rows = labelled([
      ["wanted", check.wants],
      ["saw", check.saw],
      ["on", pageLine(check)],
      ["in", chain],
    ]);
    super(`${step}: check "${check.trait}" didn't pass${when}${rows ? `\n${rows}` : ""}`);
    this.name = "TraitFailure";
    Object.defineProperty(this, NAMES_ITS_STEP, { value: true });
  }
}

/** A check's answer as a result: a bare boolean is `{ ok }`. */
export function asResult(answer: boolean | TraitResult): TraitResult {
  return typeof answer === "boolean" ? { ok: answer } : answer;
}

/** Where the page is, for a failure: its path and first heading (short waits only; a failure is already slow). */
export async function whereIs(page: Page): Promise<{ url?: string; heading?: string }> {
  try {
    const url = new URL(page.url());
    const heading = await page
      .locator("h1, h2, [role=heading]")
      .first()
      .textContent({ timeout: 500 })
      .then((t) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 80))
      .catch(() => "");
    const where = url.protocol.startsWith("http") ? url.pathname + url.search : page.url();
    return { url: where, ...(heading ? { heading } : {}) };
  } catch {
    return {};
  }
}

/** An element a passing check looked at: what the demo rings after the step. */
export interface CheckedElement {
  check: string;
  selector: string;
  /** What the check looked for, said to a person (the Trait's `says`, else its `wants`): the ring's label. */
  says?: string;
}

/** The elements each page's checks looked at since the demo last took them. On globalThis: src and dist can share a page. */
const checked: WeakMap<Page, CheckedElement[]> = ((globalThis as { [k: symbol]: WeakMap<Page, CheckedElement[]> | undefined })[
  Symbol.for("waygraph.checkedElements")
] ??= new WeakMap());

/** The elements the page's passing checks looked at since the last call (the demo rings them after a step). */
export function takeCheckedElements(page: Page): CheckedElement[] {
  const list = checked.get(page) ?? [];
  checked.delete(page);
  return list;
}

/** Runs one Trait until it passes or its time is up. A check that throws (one that waited, e.g. for a URL) is not retried. */
export async function settle(trait: Trait, page: Page, mem: MemPage): Promise<TraitResult & { error?: unknown }> {
  const until = Date.now() + (trait.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  for (;;) {
    let result: TraitResult;
    try {
      result = asResult(await trait.check(page, mem));
    } catch (error) {
      return { ok: false, saw: error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error), error };
    }
    if (result.ok) {
      const selector = result.at ?? trait.selector;
      const says = trait.says ?? trait.wants;
      if (selector) checked.set(page, [...(checked.get(page) ?? []), { check: trait.name, selector, ...(says ? { says } : {}) }]);
    }
    if (result.ok || Date.now() >= until) return result;
    await sleep(RETRY_EVERY_MS);
  }
}

async function runTraits(traits: readonly Trait[], page: Page, mem: MemPage, block: string, when: "after" | "before"): Promise<void> {
  for (const trait of traits) {
    const result = await settle(trait, page, mem);
    if (result.ok) continue;
    throw new TraitFailure({
      trait: trait.name,
      block,
      when,
      ...(trait.wants ? { wants: trait.wants } : {}),
      ...(result.saw ? { saw: result.saw } : {}),
      ...(await whereIs(page)),
    });
  }
}

/**
 * Runs every Trait for a Block that just resolved, throwing a {@link TraitFailure} on the first that doesn't pass -
 * never called before resolve, never able to change what resolve decided. `verify` may be a flat list or a function of
 * the resolved Checkpoint (a branching Block whose outcomes need different checks). Called by `runGraph` and `connect()`
 * after every `resolve`.
 */
export async function runVerify<Out>(verify: Trait[] | ((out: Out) => Trait[]) | undefined, out: Out, page: Page, mem: MemPage, blockName: string): Promise<void> {
  await runTraits(typeof verify === "function" ? verify(out) : (verify ?? []), page, mem, blockName, "after");
}

/**
 * Runs every Trait for a Block that's about to run, before `act` touches the page. `precondition` may be a flat list or
 * a function of the incoming Checkpoint. Called by `connect()` / `runGraph` right before a Block's `act`.
 */
export async function runPrecondition<In>(precondition: Trait[] | ((input: In) => Trait[]) | undefined, input: In, page: Page, mem: MemPage, blockName: string): Promise<void> {
  await runTraits(typeof precondition === "function" ? precondition(input) : (precondition ?? []), page, mem, blockName, "before");
}
