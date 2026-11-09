import type { ManifestBlock, ManifestReadBlock } from '#types/project'

/** A site's node on the map: `site:` and its origin (`site:https://shop.example.com`). */
export const SITE = 'site:'

export interface PageSummary {
  checkpoint: string
  waysIn: ManifestBlock[]
  actions: ManifestBlock[]
  expects: ManifestBlock[]
  promised: { block: string; text: string }[]
  leadsTo: ManifestBlock[]
  hubs: ManifestBlock[]
  reads: ManifestReadBlock[]
}

export interface MapEdge {
  id: string
  source: string
  target: string
  blocks: ManifestBlock[]
}

const SELF = new Set(['method', 'effect', 'api', 'expect'])

/**
 * The moves between pages: one edge per (from, to) pair, with every Block that makes it. Self-loops aren't edges, and
 * neither is a Block that starts on any page: a Nav that opens a page by its address is that page's place in its site
 * (see {@link siteMap}), and one that can start anywhere is listed under the page's ways in.
 */
export function mapEdges(blocks: ManifestBlock[]): MapEdge[] {
  const byPair = new Map<string, MapEdge>()
  for (const b of blocks) {
    // A Page Block names a page; it isn't a way to get there of its own (its nav is).
    if (b.kind === 'page' || b.kind === 'expect') continue
    for (const to of b.to) {
      if (to === '*') continue
      for (const source of b.from) {
        if (source === '*' || source === to) continue
        const id = `${source}->${to}`
        const edge = byPair.get(id) ?? { id, source, target: to, blocks: [] }
        edge.blocks.push(b)
        byPair.set(id, edge)
      }
    }
  }
  return [...byPair.values()]
}

/** Everything the map says about one page. */
export function pageSummary(
  checkpoint: string,
  blocks: ManifestBlock[],
  reads: ManifestReadBlock[]
): PageSummary {
  const lands = (b: ManifestBlock) => b.to.includes(checkpoint)
  const starts = (b: ManifestBlock) =>
    b.from.includes(checkpoint) || (b.from.includes('*') && SELF.has(b.kind))
  const selfLoop = (b: ManifestBlock) => lands(b) && starts(b)
  return {
    checkpoint,
    waysIn: blocks.filter(
      (b) => lands(b) && !selfLoop(b) && b.kind !== 'page' && b.kind !== 'expect'
    ),
    actions: blocks.filter((b) => selfLoop(b) && b.kind !== 'expect' && b.kind !== 'page'),
    expects: blocks.filter((b) => b.kind === 'expect' && lands(b)),
    promised: blocks
      .filter(lands)
      .flatMap((b) => b.expect.map((text) => ({ block: b.name, text }))),
    leadsTo: blocks.filter((b) => b.from.includes(checkpoint) && !lands(b) && b.kind !== 'expect'),
    hubs: blocks.filter((b) => b.kind === 'page' && lands(b)),
    reads: reads.filter((r) => r.from.includes(checkpoint)),
  }
}

/** "nav-cart, add-to-cart +2": an edge's label. */
export function edgeLabel(blocks: ManifestBlock[]): string {
  const names = blocks.map((b) => b.name)
  return names.length > 2
    ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    : names.join(', ')
}

/** A site the project's pages live on: its origin and how the map names it. */
export interface Site {
  id: string
  origin: string
  label: string
}

/** Where each page sits in its site, and the dashed edges that hang it there. */
export interface SiteMap {
  sites: Site[]
  /** Each page's address (its first known one) as it reads on the map: a path on its site. */
  paths: Record<string, string>
  edges: (MapEdge & { site: true })[]
}

/** The project's own site when it names no base url. */
const APP = 'the app'

/**
 * The pages as a site map: each site (the base url's origin, and every other origin a page's address names) at the root,
 * each page under the page whose path its own extends (`/registry/:code` under `/registry`), or under its site. The edge
 * into a page carries the Navs that open it by its address. A page with no known address isn't in the site map; its moves
 * place it.
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
  const edges = located.map((page) => {
    const mine = segments(page.path)
    // The page whose path is the longest one this page's path extends, on the same site.
    const parent = located
      .filter((other) => other.origin === page.origin && other.tag !== page.tag)
      .map((other) => ({ other, theirs: segments(other.path) }))
      .filter(
        ({ theirs }) =>
          theirs.length > 0 && theirs.length < mine.length && theirs.every((s, i) => s === mine[i])
      )
      .sort((a, b) => b.theirs.length - a.theirs.length)[0]?.other
    const source = parent ? parent.tag : SITE + page.origin
    const navs = blocks.filter((b) => b.url && b.to.includes(page.tag) && b.kind !== 'expect')
    return {
      id: `${source}=>${page.tag}`,
      source,
      target: page.tag,
      blocks: navs,
      site: true as const,
    }
  })
  return { sites, paths: Object.fromEntries(located.map((p) => [p.tag, p.path])), edges }
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
