// The manifest's pages: one record per Page Block (a bare shell too) with what it holds, as Studio and agents read it:
// how it opens, what it shows, its moves and expectations by key, what it covers and is covered by.
import { layoutState } from "../engine/block/kinds/layout.js";
import type { ProjectScan, ScannedPage } from "./project.js";
import { describeSets, needsOf } from "../engine/mem/state.js";
import { givenTo } from "../engine/block/access.js";
import { spanOf, type SourceSpan } from "./selectors.js";

/** One named thing a page holds: a move, an expectation or a link. */
export interface ManifestPageEntry {
  /** Its key in the page (`submit` in `do: (page) => ({ submit: ... })`). */
  key: string;
  /** The Block it is (the name run logs and flows use); missing for a move with params (a function of them). */
  block?: string;
  /** The names of a move's params, when it takes any. */
  params?: string[];
  description?: string;
  /** A link: where it leads (a page, or `"parent"`) and its selector. */
  to?: string;
  selector?: string;
  /** Who is given it (`for`); missing: everyone. */
  for?: string[];
  /** The states it changes (a logout link). */
  sets?: { key: string; value: boolean | string }[];
}

export interface ManifestPage {
  /** `file#exportName`. */
  id: string;
  name: string;
  exportName: string;
  file: string;
  source?: SourceSpan;
  /** Its Checkpoint; missing for a bare shell (no page of its own). */
  checkpoint?: string;
  description: string;
  /** How it opens: a `url`, a `click`, or its folder (`route: "folder"`); missing: it only arrives (a Method lands on it). */
  opensBy?: "url" | "click" | "folder";
  /** Where it opens from (`from`); missing: from anywhere. */
  from: string[];
  query: string[];
  /** The iframe it lives in, when it does. */
  frame?: string;
  for?: string[];
  /** The states (mem keys) the app must be in to reach it: its own `needs` and those of the shells over it. */
  needs?: string[];
  /** The Read Block that reads it (its `read`). */
  read?: string;
  do: ManifestPageEntry[];
  expects: ManifestPageEntry[];
  /** What it covers, as a shell: `"children"` (its folder) or the pages by name; with the pages it covers once loaded. */
  covers?: "children" | string[];
  coveredPages: string[];
  /** The shells it is under. */
  coveredBy: string[];
  links: ManifestPageEntry[];
  interrupts: string[];
  /** A bare shell (no page of its own). */
  bare?: true;
}

type Held = { name: string; description?: string; __waygraphTo?: string[]; __waygraphNavClick?: unknown; __waygraphLayout?: { parent?: boolean } };
const entriesOf = (record: unknown): [string, unknown][] => Object.entries((record as Record<string, unknown> | undefined) ?? {});
const paramNames = (fn: (...args: never[]) => unknown): string[] =>
  (/^[^(]*\(([^)]*)\)/.exec(Function.prototype.toString.call(fn))?.[1] ?? "").split(",").map((p) => p.trim().replace(/[:=].*$/, "").trim()).filter(Boolean);

/** The pages a scan found, as the manifest lists them. */
export function pagesFromScan(scan: ProjectScan): ManifestPage[] {
  const shells = scan.pages.filter((p) => (p.block as { __waygraphCoverLayout?: unknown }).__waygraphCoverLayout);
  const pages = scan.pages.map((p) => pageOf(p, shells));
  // A page needs what the shells over it need.
  const shellNeeds = new Map(shells.map((s) => [s.block.name, needsOf(s.block)]));
  for (const page of pages) {
    const all = [...new Set([...(page.needs ?? []), ...page.coveredBy.flatMap((s) => shellNeeds.get(s) ?? [])])];
    if (all.length) page.needs = all;
  }
  return pages;
}

function pageOf(scanned: ScannedPage, shells: ScannedPage[]): ManifestPage {
  const b = scanned.block as unknown as {
    name: string;
    description?: string;
    do?: Record<string, unknown>;
    expects?: Record<string, unknown>;
    links?: Record<string, Held>;
    __waygraphTo?: string[];
    __waygraphFrom?: string[];
    __waygraphNavUrl?: string;
    __waygraphNavUrlFn?: unknown;
    __waygraphNavClick?: unknown;
    __waygraphRoute?: string;
    __waygraphQuery?: string[];
    __waygraphFrame?: string;
    __waygraphCovers?: "children" | string[];
    __waygraphBare?: boolean;
    __waygraphReadBlock?: { name: string };
    __waygraphCoverLayout?: { name: string; interrupts: readonly string[]; access: Readonly<Record<string, readonly string[] | undefined>> };
  };
  const bare = b.__waygraphBare === true;
  const checkpoint = bare ? undefined : b.__waygraphTo?.[0];
  const layout = b.__waygraphCoverLayout;
  const opensBy = b.__waygraphRoute === "folder" ? "folder" : b.__waygraphNavUrl !== undefined || b.__waygraphNavUrlFn !== undefined ? "url" : b.__waygraphNavClick !== undefined ? "click" : undefined;
  const given = givenTo(scanned.block);
  const group = (record: unknown): ManifestPageEntry[] =>
    entriesOf(record).map(([key, entry]) =>
      typeof entry === "function"
        ? { key, params: paramNames(entry as (...args: never[]) => unknown) }
        : { key, block: (entry as Held).name, ...((entry as Held).description ? { description: (entry as Held).description } : {}) },
    );
  const covered = layout ? [...layoutState(layout.name).covers] : [];
  const source = spanOf(scanned.absFile, scanned.exportName);
  return {
    id: `${scanned.file}#${scanned.exportName}`,
    name: b.name,
    exportName: scanned.exportName,
    file: scanned.file,
    ...(source ? { source } : {}),
    ...(checkpoint && checkpoint !== "*" ? { checkpoint } : {}),
    description: b.description ?? "",
    ...(opensBy ? { opensBy } : {}),
    from: [...(b.__waygraphFrom ?? [])].filter((t) => t !== "*"),
    query: [...(b.__waygraphQuery ?? [])],
    ...(b.__waygraphFrame ? { frame: b.__waygraphFrame } : {}),
    ...(given ? { for: [...given] } : {}),
    ...(needsOf(scanned.block).length ? { needs: needsOf(scanned.block) } : {}),
    ...(b.__waygraphReadBlock ? { read: b.__waygraphReadBlock.name } : {}),
    do: group(b.do),
    expects: group(b.expects),
    ...(b.__waygraphCovers !== undefined ? { covers: b.__waygraphCovers } : {}),
    coveredPages: covered,
    coveredBy: !bare && checkpoint ? shells.filter((s) => s !== scanned && layoutState((s.block as unknown as { __waygraphCoverLayout: { name: string } }).__waygraphCoverLayout.name).covers.includes(checkpoint)).map((s) => s.block.name) : [],
    links: entriesOf(b.links).map(([key, nav]) => {
      const n = nav as Held;
      return {
        key,
        block: n.name,
        to: n.__waygraphLayout?.parent ? "parent" : (n.__waygraphTo?.[0] ?? ""),
        ...(typeof n.__waygraphNavClick === "string" ? { selector: n.__waygraphNavClick } : {}),
        ...(describeSets(n, n.__waygraphTo ?? []).length ? { sets: describeSets(n, n.__waygraphTo ?? []).map(({ key, value }) => ({ key, value })) } : {}),
        ...(layout?.access[key] ? { for: [...(layout.access[key] as readonly string[])] } : {}),
      };
    }),
    interrupts: layout ? [...layout.interrupts] : [],
    ...(bare ? { bare: true as const } : {}),
  };
}
