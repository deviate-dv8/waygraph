import type { TreeDirection } from '~/lib/layout'

/** A line to label: the Blocks it shows as badges, one under another. */
export interface LabelledEdge {
  id: string
  source: string
  target: string
  blocks: { name: string }[]
}

/**
 * Where a line's label sits: beside its target, before it (a line from an earlier column, at its arrowhead) or after it
 * (a line within a column or back up, which comes in on the far side), at `offset` from the target's centre along the
 * stack of labels there, so labels meeting at one page stack instead of covering each other.
 */
export interface LabelPlace {
  side: 'before' | 'after'
  offset: number
}

/** A badge's size: a line of monospace text and its padding. */
const BADGE = { height: 22, gap: 2, char: 7.2, padding: 22 } as const
/** Between two lines' labels in one stack, and between labels and the boxes they sit beside. */
const SPACE = { edges: 6, box: 16, margin: 24 } as const

const sizeOf = (edge: LabelledEdge) => ({
  width: Math.max(...edge.blocks.map((b) => b.name.length * BADGE.char + BADGE.padding)),
  height: edge.blocks.length * BADGE.height + (edge.blocks.length - 1) * BADGE.gap,
})

/**
 * Plans every line's label against the columns the tree puts its pages in, and the room the layout must make for them:
 * a page takes at least its stacks' length across, and a gap between two columns is at least as wide as the labels in it
 * (those before the next column's pages, those after this one's).
 */
export function planLabels(
  edges: LabelledEdge[],
  columnOf: Map<string, number>,
  direction: TreeDirection
): { places: Map<string, LabelPlace>; across: Map<string, number>; gapAfter: Map<number, number> } {
  const lr = direction === 'LR'
  const stacks = new Map<string, LabelledEdge[]>()
  for (const edge of edges) {
    if (!edge.blocks.length) continue
    const side =
      (columnOf.get(edge.target) ?? 0) > (columnOf.get(edge.source) ?? 0) ? 'before' : 'after'
    const key = `${edge.target}\u0000${side}`
    stacks.set(key, [...(stacks.get(key) ?? []), edge])
  }
  const places = new Map<string, LabelPlace>()
  const across = new Map<string, number>()
  // The widest labels before each column's pages, and after each column's pages.
  const before = new Map<number, number>()
  const after = new Map<number, number>()
  for (const [key, stack] of stacks) {
    const [target, side] = key.split('\u0000') as [string, LabelPlace['side']]
    const sizes = stack.map(sizeOf)
    // Left to right a stack runs down beside its page; top down, away from it (up before, down after).
    const length = lr
      ? sizes.reduce((sum, s) => sum + s.height, 0) + SPACE.edges * (stack.length - 1)
      : Math.max(...sizes.map((s) => s.width))
    const depth = lr
      ? Math.max(...sizes.map((s) => s.width))
      : sizes.reduce((sum, s) => sum + s.height, 0) + SPACE.edges * (stack.length - 1)
    let along = lr ? -length / 2 : 0
    stack.forEach((edge, i) => {
      const size = sizes[i]!
      places.set(edge.id, { side, offset: lr ? along + size.height / 2 : along })
      along += size.height + SPACE.edges
    })
    across.set(target, Math.max(across.get(target) ?? 0, length + 2 * SPACE.margin))
    const column = columnOf.get(target) ?? 0
    const widest = side === 'before' ? before : after
    widest.set(column, Math.max(widest.get(column) ?? 0, depth))
  }
  const gapAfter = new Map<number, number>()
  const columns = new Set([...columnOf.values()])
  for (const column of columns) {
    const needed = (after.get(column) ?? 0) + (before.get(column + 1) ?? 0)
    if (needed > 0) gapAfter.set(column, needed + 2 * SPACE.box + SPACE.margin)
  }
  return { places, across, gapAfter }
}
