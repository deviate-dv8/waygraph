// Each page's breadcrumb trail, for `Trait.breadcrumbs` (set when layouts load).
/**
 * Each page's breadcrumb trail, by its address: the addresses of the pages above it in the site map, outermost first.
 * Set when layouts load; `Trait.breadcrumbs` reads it. On globalThis, like the layouts' state.
 */
const trails: Map<string, string[]> = ((globalThis as { [k: symbol]: Map<string, string[]> | undefined })[
  Symbol.for("waygraph.breadcrumbTrails")
] ??= new Map());

/** Sets every page's trail (its address -> the addresses of the pages above it). */
export function setTrails(byPath: Readonly<Record<string, readonly string[]>>): void {
  trails.clear();
  for (const [path, up] of Object.entries(byPath)) trails.set(path, [...up]);
}

/** The trail for the page at `path`, when layouts were loaded and it's a known page. */
export function trailOf(path: string): string[] | undefined {
  return trails.get(path);
}
