// `waygraph check`: a page named by a string (`to: "Docs"`, `covers: ["Dashboard"]`, `from`) that no Page Block makes. The
// names are plain strings, so the project's scan is what checks them: a typo is named, with the page it probably meant.
import type { Manifest } from "../manifest/manifest.js";

/** A page name that names no page. */
export interface UnknownPage {
  /** The page it is written in, and where in it. */
  page: string;
  where: "move" | "link" | "covers" | "from";
  name: string;
  /** The closest page that exists. */
  suggestion?: string;
}

/** How many single-character edits turn `a` into `b`. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] ?? 0;
}

/** The page that `name` is closest to, when it is close enough to be a typo of it. */
function closest(name: string, pages: readonly string[]): string | undefined {
  const best = pages.map((p) => [p, distance(name.toLowerCase(), p.toLowerCase())] as const).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= Math.max(2, Math.floor(name.length / 3)) ? best[0] : undefined;
}

/** Every page name the project's pages write (a Method's `to`, a link's `to`, `covers`, `from`) that no Page Block has. */
export function findUnknownPages(manifest: Manifest): UnknownPage[] {
  const pages = [...new Set(manifest.pages.flatMap((p) => (p.checkpoint ? [p.checkpoint] : [])))];
  const known = new Set(pages);
  const found: UnknownPage[] = [];
  const check = (page: string, where: UnknownPage["where"], name: string | undefined) => {
    if (name === undefined || name === "parent" || name === "*" || name === "__start__" || known.has(name)) return;
    const suggestion = closest(name, pages);
    found.push({ page, where, name, ...(suggestion ? { suggestion } : {}) });
  };
  for (const page of manifest.pages) {
    for (const from of page.from) check(page.name, "from", from);
    if (Array.isArray(page.covers)) for (const name of page.covers) check(page.name, "covers", name);
    for (const link of page.links) check(page.name, "link", link.to);
    for (const move of manifest.blocks.filter((b) => b.group === "do" && b.owner === page.id)) for (const to of move.to) check(page.name, "move", to);
  }
  return found;
}
