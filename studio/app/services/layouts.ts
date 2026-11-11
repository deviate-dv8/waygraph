// The map's layouts and accounts: each layout drawn once (a node, a line to each page its links lead to), and the map as
// one account sees it (only what it's given, `for`).
import type { ManifestBlock, ManifestLayout, MapAccess, MapEdge } from '#types/project'

/** A layout's node on the map: `layout:` and its name. */
export const LAYOUT = 'layout:'
export const layoutId = (name: string) => LAYOUT + name

/** The Blocks that are layouts' links: drawn once from their layout, not from every page it covers. */
export function layoutLinks(layouts: ManifestLayout[]): Set<string> {
  return new Set(layouts.flatMap((l) => l.links.map((link) => link.block)))
}

/** A layout's lines: one to each page its links lead to (a link up, to every page above one it covers). */
export function layoutEdges(layouts: ManifestLayout[], blocks: ManifestBlock[]): MapEdge[] {
  const byName = new Map(blocks.map((b) => [b.name, b]))
  const edges = new Map<string, MapEdge>()
  for (const layout of layouts) {
    for (const link of layout.links) {
      const block = byName.get(link.block)
      if (!block) continue
      for (const target of link.to === 'parent' ? block.to : [link.to]) {
        const id = `${layoutId(layout.name)}->${target}`
        const edge = edges.get(id) ?? { id, source: layoutId(layout.name), target, blocks: [] }
        edge.blocks.push(block)
        edges.set(id, edge)
      }
    }
  }
  return [...edges.values()]
}

/** The layouts each page is under, by page. */
export function layoutsByPage(layouts: ManifestLayout[]): Map<string, string[]> {
  const by = new Map<string, string[]>()
  for (const l of layouts)
    for (const page of l.covers) by.set(page, [...(by.get(page) ?? []), l.name])
  return by
}

/** Every account the project gives something to (`for`), by name. */
export function accountsNamed(blocks: ManifestBlock[], layouts: ManifestLayout[]): string[] {
  return [
    ...new Set([
      ...blocks.flatMap((b) => b.for ?? []),
      ...layouts.flatMap((l) => l.links.flatMap((link) => link.for ?? [])),
    ]),
  ].sort()
}

/** What one account is given: its Blocks, its layouts' links, and the pages it can't open. */
export type AccountView = {
  blocks: ManifestBlock[]
  layouts: ManifestLayout[]
  /** The pages a Page Block's `for` keeps from it. */
  closed: Set<string>
  /** The Blocks left out (links, Methods, Navs it isn't given, and those to or from a page it can't open). */
  leftOut: number
}

/** The map as `account` sees it: only what it's given. Everyone (null): all of it. */
export function viewAs(
  account: string | null,
  blocks: ManifestBlock[],
  layouts: ManifestLayout[]
): AccountView {
  if (!account) return { blocks, layouts, closed: new Set(), leftOut: 0 }
  const given = (list: string[] | undefined) => !list || list.includes(account)
  const closed = new Set(
    blocks.filter((b) => b.kind === 'page' && !given(b.for)).flatMap((b) => b.to)
  )
  // A Block keeps the pages it can still go from and to; one with none left is left out.
  const kept = blocks.flatMap((b) => {
    if (!given(b.for)) return []
    const from = b.from.filter((t) => !closed.has(t))
    const to = b.to.filter((t) => !closed.has(t))
    return from.length && to.length
      ? [from.length === b.from.length && to.length === b.to.length ? b : { ...b, from, to }]
      : []
  })
  return {
    blocks: kept,
    layouts: layouts.map((l) => ({
      ...l,
      covers: l.covers.filter((p) => !closed.has(p)),
      links: l.links.filter((link) => given(link.for) && !closed.has(link.to)),
    })),
    closed,
    leftOut: blocks.length - kept.length,
  }
}

/**
 * What the map page needs about layouts and accounts, as `account` sees the project (null, or an account the project
 * doesn't have: everyone): the Blocks and pages it's given, each layout's node and lines, and how much was left out. The
 * accounts are the project's (`known`), else (an older manifest) those `for` names.
 */
export function mapAccess(
  account: string | null,
  blocks: ManifestBlock[],
  layouts: ManifestLayout[],
  known?: string[]
): { blocks: ManifestBlock[]; access: MapAccess } {
  const accounts = [...new Set([...(known ?? []), ...accountsNamed(blocks, layouts)])].sort()
  const as = account && accounts.includes(account) ? account : null
  const view = viewAs(as, blocks, layouts)
  const pageGiven: Record<string, string[]> = {}
  for (const b of blocks)
    if (b.kind === 'page' && b.for) for (const tag of b.to) pageGiven[tag] = b.for
  return {
    blocks: view.blocks,
    access: {
      accounts,
      account: as,
      layouts: view.layouts.map((l) => ({ ...l, node: layoutId(l.name) })),
      lines: layoutEdges(view.layouts, view.blocks),
      pageLayouts: Object.fromEntries(layoutsByPage(view.layouts)),
      links: [...layoutLinks(layouts)],
      closed: [...view.closed],
      leftOut: view.leftOut,
      pageGiven,
    },
  }
}
