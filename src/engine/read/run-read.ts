// Runs read specs against a page: one round trip per field, list or table (never one per cell), and no waiting - a read
// takes the page as it is. What a selector doesn't find comes back as missing, not as an error.
import type { Page } from "@playwright/test";
import type { MemPage } from "../mem/mem.js";
import { ignorePageGone, ignoreTimeout } from "../page-gone.js";
import type { ReadSpec } from "./read-key.js";
import { eachReader, type FieldPlan, type ReaderPlan } from "./readers.js";

/** A read's leaves by path (`post.likes`), `null` where the page did not show it, plus why a path is missing. */
export interface ReadResult {
  values: Map<string, unknown>;
  notes: Map<string, string>;
}

/** What the in-page reader is asked for. */
type InPageAsk =
  | { mode: "field"; plan: FieldPlan }
  | { mode: "list"; fields: Record<string, FieldPlan> }
  | { mode: "table"; columns: Record<string, string> };

/** In the page (self-contained, shipped by evaluateAll): reads a field, list rows or a table from the matched elements. */
function readInPage(matched: Element[], ask: InPageAsk): unknown {
  const shown = (el: Element): boolean => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  // textContent, whitespace collapsed: innerText forces layout per element (125ms vs 3ms for 8,000 table cells).
  const textOf = (el: Element): string => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const take = (els: Element[], plan: FieldPlan): unknown => {
    const first = els[0];
    switch (plan.kind) {
      case "count":
        return els.length;
      case "visible":
        return els.some(shown);
      case "texts":
        return els.map(textOf);
      case "attr":
        return first ? first.getAttribute(plan.attr ?? "") : null;
      case "value":
        return first && "value" in first ? String((first as HTMLInputElement).value) : null;
      default:
        // text, and number (parsed in Node from the text)
        return first ? textOf(first) : null;
    }
  };
  const within = (root: Element, plan: FieldPlan): Element[] => (plan.selector ? [...root.querySelectorAll(plan.selector)] : [root]);
  if (ask.mode === "field") return take(matched, ask.plan);
  if (ask.mode === "list") {
    return matched.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [name, plan] of Object.entries(ask.fields)) out[name] = take(within(row, plan), plan);
      return out;
    });
  }
  const table = matched[0];
  if (!table) return null;
  const HEAD = "th, [role=columnheader]";
  const CELL = "td, th, [role=cell], [role=gridcell], [role=rowheader], [role=columnheader]";
  const rows = [...table.querySelectorAll("tr, [role=row]")];
  const headRow = rows.find((r) => r.querySelector(HEAD) && !r.querySelector("td, [role=cell], [role=gridcell]"));
  const headers = headRow ? [...headRow.querySelectorAll(CELL)].map(textOf) : [];
  const index: Record<string, number> = {};
  const absent: string[] = [];
  for (const [name, header] of Object.entries(ask.columns)) {
    const at = headers.findIndex((h) => h.toLowerCase() === header.toLowerCase());
    if (at < 0) absent.push(name);
    else index[name] = at;
  }
  const body = rows.filter((r) => r !== headRow && r.querySelector("td, [role=cell], [role=gridcell], [role=rowheader]"));
  const out = body.map((r) => {
    const cells = [...r.querySelectorAll(CELL)];
    const row: Record<string, string | null> = {};
    for (const name of Object.keys(ask.columns)) {
      const at = index[name];
      const cell = at === undefined ? undefined : cells[at];
      row[name] = cell ? textOf(cell) : null;
    }
    return row;
  });
  const declared = Number(table.getAttribute("aria-rowcount"));
  return { rows: out, absent, rowCount: Number.isFinite(declared) && declared > 0 ? declared - (headRow ? 1 : 0) : out.length };
}

/** In the page: resolves once the DOM has had no change for `quietMs` (or after `capMs`, whichever comes first). */
function domQuiet({ quietMs, capMs }: { quietMs: number; capMs: number }): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve();
    };
    let quiet = setTimeout(done, quietMs);
    const cap = setTimeout(done, capMs);
    const observer = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, quietMs);
    });
    observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}

/**
 * Waits for the page to stop changing before a read. A step's verify can pass before the app has rendered where it
 * landed (a URL check passes the moment a client-side route changes), so a read right after it can see the old page.
 */
export async function settlePage(page: Page, quietMs = 150, capMs = 2000): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: capMs }).catch(ignoreTimeout);
  await page.evaluate(domQuiet, { quietMs, capMs }).catch(ignorePageGone);
}

/** The first number in a display text: `"$1,299.00"` -> 1299, `"41 likes"` -> 41, no number -> null. */
export function firstNumber(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

function finishField(plan: FieldPlan, raw: unknown): unknown {
  return plan.kind === "number" ? firstNumber(raw) : raw;
}

async function readOne(page: Page, mem: MemPage, plan: ReaderPlan, path: string, notes: Map<string, string>): Promise<unknown> {
  if (plan.kind === "fn") return (await plan.fn(page, mem)) ?? null;
  const matched = page.locator(plan.selector);
  if (plan.kind === "list") {
    const rows = (await matched.evaluateAll(readInPage, { mode: "list", fields: plan.fields } as InPageAsk)) as Record<string, unknown>[];
    return rows.map((row) => {
      for (const [name, field] of Object.entries(plan.fields)) row[name] = finishField(field, row[name]);
      return row;
    });
  }
  if (plan.kind === "table") {
    const got = (await matched.evaluateAll(readInPage, { mode: "table", columns: plan.columns } as InPageAsk)) as
      | { rows: Record<string, string | null>[]; absent: string[]; rowCount: number }
      | null;
    if (!got) return null;
    const why: string[] = [];
    if (got.absent.length) why.push(`no column ${got.absent.map((c) => JSON.stringify(plan.columns[c])).join(", ")}`);
    if (got.rowCount > got.rows.length) why.push(`${got.rows.length} of ${got.rowCount} rows rendered (scroll or page to read more)`);
    if (why.length) notes.set(path, why.join("; "));
    return got.rows;
  }
  return finishField(plan, await matched.evaluateAll(readInPage, { mode: "field", plan } as InPageAsk));
}

/** Reads every field of every spec, in parallel, into leaves by path. */
export async function runReadSpecs(page: Page, mem: MemPage, specs: readonly ReadSpec[]): Promise<ReadResult> {
  const values = new Map<string, unknown>();
  const notes = new Map<string, string>();
  const jobs: Promise<void>[] = [];
  for (const spec of specs) {
    eachReader(spec.fields, spec.namespace, (path, reader) => {
      values.set(path, null);
      jobs.push(readOne(page, mem, reader.plan, path, notes).then((v) => void values.set(path, v)));
    });
  }
  await Promise.all(jobs);
  return { values, notes };
}
