// Runs a Block's Traits: after resolve (verify) and before act (precondition). A check that doesn't wait is retried until
// it passes or its time runs out, so a page still settling doesn't fail it; a failure says what the check wanted, what the
// page showed and where, as one sentence and as data (on the run's step:error event).
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
  /** "after": the Block's verify; "before": its precondition. */
  when: "after" | "before";
  wants?: string;
  saw?: string;
  url?: string;
  heading?: string;
}

/** A Trait that didn't pass. `message` reads as a sentence; `check` is the same as data. */
export class TraitFailure extends Error {
  constructor(readonly check: TraitCheckReport) {
    const where = check.url ? ` (on ${check.url}${check.heading ? ` "${check.heading}"` : ""})` : "";
    const detail = [check.wants && `wanted ${check.wants}`, check.saw && `saw ${check.saw}`].filter(Boolean).join("; ");
    super(`trait "${check.trait}" failed ${check.when} "${check.block}"${detail ? `: ${detail}` : ""}${where}`);
    this.name = "TraitFailure";
  }
}

/** A check's answer as a result: a bare boolean is `{ ok }`. */
export function asResult(answer: boolean | TraitResult): TraitResult {
  return typeof answer === "boolean" ? { ok: answer } : answer;
}

/** Where the page is, for a failure: its path and first heading (short waits only; a failure is already slow). */
async function whereIs(page: Page): Promise<{ url?: string; heading?: string }> {
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

/** Runs one Trait until it passes or its time is up. A check that throws (one that waited, e.g. for a URL) is not retried. */
async function settle(trait: Trait, page: Page, mem: MemPage): Promise<TraitResult & { error?: unknown }> {
  const until = Date.now() + (trait.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  for (;;) {
    let result: TraitResult;
    try {
      result = asResult(await trait.check(page, mem));
    } catch (error) {
      return { ok: false, saw: error instanceof Error ? error.message.split("\n")[0]! : String(error), error };
    }
    if (result.ok || Date.now() >= until) return result;
    await new Promise((r) => setTimeout(r, RETRY_EVERY_MS));
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
