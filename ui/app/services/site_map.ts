import type { ManifestBlock, Folder, SiteMap } from '#types/project'

/** A site's node on the map: `site:` and its origin (`site:https://shop.example.com`). */
export const SITE = 'site:'
/** A folder's id: a path segment on the way to pages (`/platform/plant`), with no page of its own. */
export const FOLDER = 'folder:'

/** The project's own site when it names no base url. */
const APP = 'the app'

/**
 * The pages as a site map: each site (the base url's origin, and every other origin a page's address names) at the root,
 * each page under the page whose path its own extends (`/registry/:code` under `/registry`), or under its site. Every
 * path segment no page has is a folder (`/auth`, `/platform`, then `/platform/plant`), so each level of the address is a
 * level of the map. The edge into a page carries the Navs that open it by its address. A page with no known address isn't
 * in the site map; its moves place it.
 */
export function siteMap(
  checkpoints: string[],
  pageUrls: Record<string, string[]>,
  baseUrl: string | undefined,
  blocks: ManifestBlock[]
): SiteMap {
  const base = originOf(baseUrl) ?? APP
  const located = checkpoints.flatMap((tag) => {
    // A full address says which site the page is on; a path alone (a `Trait.url` pathname) only where on it.
    const url = pageUrls[tag]?.find((u) => originOf(u)) ?? pageUrls[tag]?.[0]
    if (!url) return []
    const absolute = originOf(url)
    const path = absolute ? url.slice(absolute.length) || '/' : url
    return [{ tag, origin: absolute ?? base, path }]
  })
  const origins = [...new Set(located.map((p) => p.origin))].sort((a, b) =>
    a === base ? -1 : b === base ? 1 : a.localeCompare(b)
  )
  const sites = origins.map((origin) => ({
    id: SITE + origin,
    origin,
    label: origin === APP ? APP : hostOf(origin),
  }))
  const segments = (path: string) => path.split(/[?#]/)[0]!.split('/').filter(Boolean)
  const key = (parts: string[]) => '/' + parts.join('/')
  // Every node a page can hang from, by site and path: the pages, then the folders between them.
  const holders = located.map((page) => ({
    id: page.tag,
    origin: page.origin,
    parts: segments(page.path),
  }))
  const folders: Folder[] = []
  for (const origin of origins) {
    const mine = holders.filter((h) => h.origin === origin)
    const taken = new Set(mine.map((h) => key(h.parts)))
    // Each path a page's path passes through on the way to it.
    const passed = new Set<string>()
    for (const { parts } of mine) {
      for (let depth = 1; depth < parts.length; depth++) passed.add(key(parts.slice(0, depth)))
    }
    for (const path of [...passed].sort()) {
      if (!taken.has(path)) folders.push({ id: FOLDER + origin + path, origin, path, label: '' })
    }
  }
  const all = [
    ...holders,
    ...folders.map((f) => ({ id: f.id, origin: f.origin, parts: segments(f.path) })),
  ]
  /** The node whose path is the longest one this path extends, on the same site; else the site. */
  const parentOf = (id: string, origin: string, parts: string[]) =>
    all
      .filter(
        (other) =>
          other.origin === origin &&
          other.id !== id &&
          other.parts.length > 0 &&
          other.parts.length < parts.length &&
          other.parts.every((s, i) => s === parts[i])
      )
      .sort((a, b) => b.parts.length - a.parts.length)[0]
  for (const folder of folders) {
    const parts = segments(folder.path)
    const parent = parentOf(folder.id, folder.origin, parts)
    folder.label = parts.slice(parent?.parts.length ?? 0).join('/') + '/'
  }
  const edges = all.map((node) => {
    const parent = parentOf(node.id, node.origin, node.parts)
    const source = parent ? parent.id : SITE + node.origin
    const navs = blocks.filter((b) => b.url && b.to.includes(node.id) && b.kind !== 'expect')
    return {
      id: `${source}=>${node.id}`,
      source,
      target: node.id,
      blocks: navs,
      site: true as const,
    }
  })
  return { sites, folders, paths: Object.fromEntries(located.map((p) => [p.tag, p.path])), edges }
}

/**
 * `https://shop.example.com` for an absolute url; nothing for a path. A local file's site is its folder
 * (`file:///work/app/`): a file url has no origin of its own.
 */
function originOf(url: string | undefined): string | undefined {
  if (!url || !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'file:' ? new URL('.', u).href : u.origin
  } catch {
    return undefined
  }
}

/** The origin as a site map names it: its host (`shop.example.com`), or a local folder's name. */
function hostOf(origin: string): string {
  try {
    const u = new URL(origin)
    return u.protocol === 'file:'
      ? decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? 'local files')
      : u.host
  } catch {
    return origin
  }
}
