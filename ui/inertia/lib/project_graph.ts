import type { ManifestBlock, ManifestReadBlock, MapEdge } from '#types/project'

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

const SELF = new Set(['method', 'api', 'expect'])

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
