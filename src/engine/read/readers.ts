// What a Read Block's ctx hands out: readers. Each is a plan (a selector and what to take), not a value, so the engine
// can read a whole list or table in one round trip to the page instead of one call per cell.
import type { Page } from "@playwright/test";
import type { MemPage } from "../mem/mem.js";

/** What to take from the matched element(s). */
export type FieldKind = "text" | "texts" | "number" | "attr" | "value" | "visible" | "count";

/** One field: a CSS selector (inside a list row; `""` is the row itself) and what to take from it. */
export interface FieldPlan {
  kind: FieldKind;
  selector: string;
  attr?: string;
}

/** A reader's plan. Top-level selectors are Playwright selectors; selectors inside a list row are CSS. */
export type ReaderPlan =
  | FieldPlan
  | { kind: "list"; selector: string; fields: Record<string, FieldPlan> }
  | { kind: "table"; selector: string; columns: Record<string, string> }
  | { kind: "fn"; fn: (page: Page, mem: MemPage) => unknown };

/** A reader of a `T`, handed out by a {@link ReadCtx}. */
export class Reader<T> {
  /** Type-only: carries `T` so a reader of the wrong type doesn't compile. Never set. */
  declare readonly __type?: T;

  constructor(readonly plan: ReaderPlan) {}
}

/** A namespace's fields after its type is checked: a reader, or nested fields one level down. */
export interface ReadFields {
  readonly [field: string]: Reader<unknown> | ReadFields | undefined;
}

/** The readers a list row offers, each scoped to the row (no selector: the row itself). */
export interface RowCtx {
  text(selector?: string): Reader<string>;
  texts(selector?: string): Reader<string[]>;
  /** The first number in the text (`"$1,299.00"` -> 1299, `"41 likes"` -> 41). */
  number(selector?: string): Reader<number>;
  attr(selector: string, name: string): Reader<string>;
  value(selector?: string): Reader<string>;
  visible(selector?: string): Reader<boolean>;
  count(selector: string): Reader<number>;
}

/** What a Read Block's `read` is given: the run's Mem and the readers for the page. */
export interface ReadCtx {
  readonly mem: MemPage;
  /** Trimmed text of the first match. */
  text(selector: string): Reader<string>;
  /** Trimmed text of every match. */
  texts(selector: string): Reader<string[]>;
  /** The first number in the first match's text (`"$1,299.00"` -> 1299, `"41 likes"` -> 41). */
  number(selector: string): Reader<number>;
  attr(selector: string, name: string): Reader<string>;
  /** A form field's current value. */
  value(selector: string): Reader<string>;
  /** Whether any match is visible (false, not missing, when nothing matches). */
  visible(selector: string): Reader<boolean>;
  count(selector: string): Reader<number>;
  /**
   * One object per row, each field read inside its row, in one round trip for the whole list.
   * @example ctx.list(".comment", (row) => ({ author: row.text(".author"), body: row.text(".body") }))
   */
  list<R>(rowSelector: string, row: (row: RowCtx) => { readonly [K in keyof R]: Reader<R[K]> }): Reader<R[]>;
  /**
   * One object per table row, each field the cell under the column with that header text (`<th>` or
   * `role=columnheader`), in one round trip. A header that isn't there is reported as missing.
   * @example ctx.table("#orders", { id: "Order #", total: "Total" })
   */
  table<C extends string>(selector: string, columns: Readonly<Record<C, string>>): Reader<Record<C, string>[]>;
  /** Anything the helpers don't cover; `null` or `undefined` is reported as missing. */
  fn<T>(read: (page: Page, mem: MemPage) => T | Promise<T>): Reader<Awaited<T>>;
}

function fieldReaders(): RowCtx {
  const field = <T>(kind: FieldKind, selector = "", attr?: string): Reader<T> => new Reader<T>(attr === undefined ? { kind, selector } : { kind, selector, attr });
  return {
    text: (s) => field("text", s),
    texts: (s) => field("texts", s),
    number: (s) => field("number", s),
    attr: (s, name) => field("attr", s, name),
    value: (s) => field("value", s),
    visible: (s) => field("visible", s),
    count: (s) => field("count", s),
  };
}

export function createReadCtx(mem: MemPage): ReadCtx {
  const row = fieldReaders();
  return {
    mem,
    text: (s) => row.text(s),
    texts: (s) => row.texts(s),
    number: (s) => row.number(s),
    attr: (s, name) => row.attr(s, name),
    value: (s) => row.value(s),
    visible: (s) => row.visible(s),
    count: (s) => row.count(s),
    list: (selector, build) => {
      const fields: Record<string, FieldPlan> = {};
      for (const [name, reader] of Object.entries(build(fieldReaders()) as Record<string, Reader<unknown>>)) {
        fields[name] = reader.plan as FieldPlan;
      }
      return new Reader({ kind: "list", selector, fields });
    },
    table: (selector, columns) => new Reader({ kind: "table", selector, columns: { ...columns } }),
    fn: (read) => new Reader({ kind: "fn", fn: read }),
  };
}
