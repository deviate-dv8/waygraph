// The small types and helpers of a Page Block (its address params, query and links, what an inline Method lands on, the
// address its folder gives it), apart from page.ts so that file stays about the page itself.
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { DefinedBlock } from "../block.js";
import type { Trait } from "../../trait/trait.js";
import type { MemPage } from "../../mem/mem.js";
import type { Account } from "../../flow/account.js";

/** The params of a page's address: `/requests/:id` and `/requests/[id]` have `id`; none: `never`. */
export type UrlParams<U extends string> = string extends U
  ? never
  : U extends `${string}/:${infer P}/${infer Rest}`
    ? P | UrlParams<`/${Rest}`>
    : U extends `${string}/:${infer P}`
      ? P
      : U extends `${string}[${infer P}]${infer Rest}`
        ? P | UrlParams<Rest>
        : never;

export type Params<U extends string, Q extends string> = { [K in UrlParams<U>]: string | number } & { [K in Q]?: string | number };

/**
 * `Page.go({ id, tab })`: the page opened at one address of its pattern (path params are required, `query` ones optional),
 * and `Page.setQuery({ tab })`: a Method that changes the query on the page it's on. Each present when it applies.
 */
export type PageGo<Out extends Checkpoint<string>, U extends string, Q extends string> = ([UrlParams<U>] extends [never]
  ? [Q] extends [never]
    ? unknown
    : { readonly go: (params: Params<U, Q>) => DefinedBlock<Checkpoint<string>, Out> }
  : { readonly go: (params: Params<U, Q>) => DefinedBlock<Checkpoint<string>, Out> }) &
  ([Q] extends [never] ? unknown : { readonly setQuery: (values: { [K in Q]?: string | number }) => DefinedBlock<Out, Out> });

/** A page whose address is its folder: `go` takes its params by name (a `[id]` folder), untyped, as the folder isn't visible to types. */
export type PageFolderGo<Out extends Checkpoint<string>, F> = F extends "folder"
  ? { readonly go: (params: Record<string, string | number>) => DefinedBlock<Checkpoint<string>, Out> }
  : unknown;

declare global {
  /**
   * The names of the project's pages, for `to` and `covers` to complete and check. `waygraph types` fills it
   * (`src/waygraph-pages.d.ts`, rewritten by `waygraph typecheck` and `check`); empty, any name is accepted.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface WaygraphPages {}
}

/** A page's name: one of the project's (completed, and a typo is an error), or any string until `waygraph types` has run. */
export type PageName = [keyof WaygraphPages] extends [never] ? string : keyof WaygraphPages & string;

/** `Shell.links.documents`: the links a covering page declares, present when it declares any. */
export type PageLinks<Lk> = [keyof Lk] extends [never] ? unknown : { readonly links: Lk };

/** A link of a covering page: where it leads (a page's name, or `"parent"`) and how it's clicked. */
export interface InlineLink<To extends PageName | "parent" | Checkpoint<string>> {
  /** A page's name, its Checkpoint, or `"parent"` (the page above, in the site map). */
  to: To;
  click: string | ((mem: MemPage) => string);
  /** The accounts that see it; without it, every account. */
  for?: readonly Account[];
  description?: string;
  /** Checks on arrival, over the landing on `to`. */
  verify?: Trait[];
}


/** Where an inline Method lands, if not on its page: a page's name (`"Dashboard"`) or a Checkpoint; a list when it can land on several. */
export type LandsOn = PageName | Checkpoint<string>;
export type CpOfLands<T> = T extends string ? Checkpoint<T> : T extends Checkpoint<string> ? T : never;


/**
 * The address a page's folder gives it: `src/map/(app)/requests/[id]/_page.block.ts` is `/requests/[id]`. `(group)` and
 * `_private` folders aren't part of it. Read from where `definePageBlock` was called, so it needs no path from the page.
 */
export function addressFromFolder(name: string): string {
  const frames = (new Error().stack ?? "").split("\n").map((l) => /(?:file:\/\/)?(\/.+?\.[cm]?[jt]s):\d+:\d+/.exec(l)?.[1]).filter((f): f is string => !!f);
  const file = frames.map((f) => decodeURIComponent(f.replace(/^file:\/\//, ""))).find((f) => /\/src\/map\//.test(f));
  if (!file) throw new Error(`definePageBlock("${name}"): route: "folder" needs the page to be defined under src/map/`);
  const rel = file.slice(file.lastIndexOf("/src/map/") + "/src/map/".length).split("/").slice(0, -1);
  const segments = rel.filter((seg) => !/^\(.*\)$/.test(seg) && !seg.startsWith("_"));
  return "/" + segments.join("/");
}

