// The site map: each page under the page or folder its address hangs from, each site at the root. Built from the
// addresses pages are known by (`pageUrls`): the map draws it, and a layout's breadcrumbs (`to: "parent"`) follow it.

/** A site's id: `site:` and its origin (`site:https://shop.example.com`). */
export const SITE = "site:";
/** A folder's id: `folder:`, its site's origin and the path no page has (`/platform/plant`). */
export const FOLDER = "folder:";
/** The project's own site when no base url names it. */
const APP = "the app";

export interface SiteTree {
  sites: { id: string; origin: string; label: string }[];
  /** Each path segment on the way to pages that no page has: its full path, and its label past its parent (`plant/`). */
  folders: { id: string; origin: string; path: string; label: string }[];
  /** Each page's address as the map reads it: a path on its site. */
  paths: Record<string, string>;
  /** Each page's and folder's parent: a page, a folder or a site. */
  parents: Record<string, string>;
}

/** The site map of `checkpoints`, from the addresses each is known by. A page with no known address isn't in it. */
export function siteTree(checkpoints: readonly string[], pageUrls: Readonly<Record<string, readonly string[]>>, baseUrl: string | undefined): SiteTree {
  const base = originOf(baseUrl) ?? APP;
  const located = checkpoints.flatMap((tag) => {
    // A full address says which site the page is on; a path alone (a `Trait.url` pathname) only where on it.
    const url = pageUrls[tag]?.find((u) => originOf(u)) ?? pageUrls[tag]?.[0];
    if (!url) return [];
    const absolute = originOf(url);
    const path = absolute ? url.slice(absolute.length) || "/" : url;
    return [{ tag, origin: absolute ?? base, path }];
  });
  const origins = [...new Set(located.map((p) => p.origin))].sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const sites = origins.map((origin) => ({ id: SITE + origin, origin, label: origin === APP ? APP : hostOf(origin) }));
  const segments = (path: string) => (path.split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
  const key = (parts: string[]) => "/" + parts.join("/");
  const holders = located.map((page) => ({ id: page.tag, origin: page.origin, parts: segments(page.path) }));
  const folders: SiteTree["folders"] = [];
  for (const origin of origins) {
    const mine = holders.filter((h) => h.origin === origin);
    const taken = new Set(mine.map((h) => key(h.parts)));
    const passed = new Set<string>();
    for (const { parts } of mine) for (let depth = 1; depth < parts.length; depth++) passed.add(key(parts.slice(0, depth)));
    for (const path of [...passed].sort()) if (!taken.has(path)) folders.push({ id: FOLDER + origin + path, origin, path, label: "" });
  }
  const all = [...holders, ...folders.map((f) => ({ id: f.id, origin: f.origin, parts: segments(f.path) }))];
  /** The node whose path is the longest one this path extends, on the same site. */
  const holderOf = (id: string, origin: string, parts: string[]) =>
    all
      .filter((o) => o.origin === origin && o.id !== id && o.parts.length > 0 && o.parts.length < parts.length && o.parts.every((s, i) => s === parts[i]))
      .sort((a, b) => b.parts.length - a.parts.length)[0];
  const parents: Record<string, string> = {};
  for (const node of all) parents[node.id] = holderOf(node.id, node.origin, node.parts)?.id ?? SITE + node.origin;
  for (const folder of folders) {
    const parts = segments(folder.path);
    const holder = holderOf(folder.id, folder.origin, parts);
    folder.label = parts.slice(holder?.parts.length ?? 0).join("/") + "/";
  }
  return { sites, folders, paths: Object.fromEntries(located.map((p) => [p.tag, p.path])), parents };
}

/** The page above `checkpoint` in the map: its nearest ancestor that is a page (folders and sites aren't). */
export function parentPage(tree: SiteTree, checkpoint: string): string | undefined {
  return ancestorPages(tree, checkpoint).at(-1);
}

/** The pages above `checkpoint`, outermost first: what its breadcrumbs lead to. */
export function ancestorPages(tree: SiteTree, checkpoint: string): string[] {
  const up: string[] = [];
  for (let at = tree.parents[checkpoint]; at && !at.startsWith(SITE); at = tree.parents[at]) {
    if (!at.startsWith(FOLDER)) up.unshift(at);
  }
  return up;
}

/**
 * `https://shop.example.com` for an absolute url; nothing for a path. A local file's site is its folder
 * (`file:///work/app/`): a file url has no origin of its own.
 */
function originOf(url: string | undefined): string | undefined {
  if (!url || !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "file:" ? new URL(".", u).href : u.origin;
  } catch {
    return undefined;
  }
}

/** The origin as the map names it: its host (`shop.example.com`), or a local folder's name. */
function hostOf(origin: string): string {
  try {
    const u = new URL(origin);
    return u.protocol === "file:" ? decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "local files") : u.host;
  } catch {
    return origin;
  }
}
