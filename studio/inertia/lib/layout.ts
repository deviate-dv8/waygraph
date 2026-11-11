/** A node's box in the layout. */
export interface LayoutNode {
  id: string
  width: number
  height: number
}

/** How many leaves stack in one column, left to right, before the next column starts. */
const RUN = 4

/** Which way a tree grows: left to right (each depth a column) or top down (each depth a row). */
export type TreeDirection = 'LR' | 'TB'

/**
 * Room the layout makes beyond the boxes, so what's drawn beside a box (the labels of the lines into it) pushes its
 * neighbours away instead of covering them: a node can take more room across than its box, and the gap after a column
 * (or row) can be wider than the default.
 */
export interface Room {
  /** A node's own box, when it isn't the default (a page that lists what it shows is taller). */
  size?: (id: string) => { width: number; height: number } | undefined
  /** The room a node takes across (its row's height left to right, its column's width top down), its box centred in it. */
  across?: (id: string) => number
  /** The gap after a column (or row), from its far edge to the next one's near edge. */
  gapAfter?: (column: number) => number
}

const GAPS = { LR: { across: 28, deep: 170 }, TB: { across: 36, deep: 130 } } as const

/**
 * The column (or row) each node of a tree sits in: its depth, or later for a long run of leaves laid out as a grid. It
 * depends on the tree alone, never on sizes, so labels can be measured against it before the layout.
 */
export function treeColumns(
  roots: string[],
  childrenOf: Map<string, string[]>,
  direction: TreeDirection = 'LR'
): Map<string, number> {
  return new Map(
    [...walkTree(roots, childrenOf, direction, () => 1, 0)].map(([id, at]) => [id, at.depth])
  )
}

/**
 * A tree (a site map): each depth is a column (left to right) or a row (top down); a node's children sit after it in
 * the order given, and the node is centred on them. Several roots sit side by side. Positions are top-left corners.
 */
export function layoutTree(
  roots: string[],
  childrenOf: Map<string, string[]>,
  box: { width: number; height: number },
  direction: TreeDirection = 'LR',
  room: Room = {}
): Map<string, { x: number; y: number }> {
  const lr = direction === 'LR'
  const own = (id: string) => room.size?.(id) ?? box
  const boxAcrossOf = (id: string) => (lr ? own(id).height : own(id).width)
  const boxDeepOf = (id: string) => (lr ? own(id).width : own(id).height)
  const sizeOf = (id: string) => Math.max(boxAcrossOf(id), room.across?.(id) ?? 0)
  const at = walkTree(roots, childrenOf, direction, sizeOf, GAPS[direction].across)
  // Where each column starts: its deepest box, then that column's gap, then the next.
  const deepest = Math.max(0, ...[...at.values()].map((a) => a.depth))
  const columnDeep = new Map<number, number>()
  for (const [id, { depth }] of at)
    columnDeep.set(depth, Math.max(columnDeep.get(depth) ?? 0, boxDeepOf(id)))
  const start: number[] = [0]
  for (let column = 0; column < deepest; column++) {
    const gap = Math.max(GAPS[direction].deep, room.gapAfter?.(column) ?? 0)
    start.push(start[column]! + (columnDeep.get(column) ?? (lr ? box.width : box.height)) + gap)
  }
  const placed = new Map<string, { x: number; y: number }>()
  for (const [id, { across: a, depth }] of at) {
    // The node's slot is its whole room; its box sits in the middle of it.
    const across = a + (sizeOf(id) - boxAcrossOf(id)) / 2
    const deep = start[depth]!
    placed.set(id, lr ? { x: 40 + deep, y: 40 + across } : { x: 40 + across, y: 40 + deep })
  }
  return placed
}

/** Each node's slot: where it starts across, and its column. */
function walkTree(
  roots: string[],
  childrenOf: Map<string, string[]>,
  direction: TreeDirection,
  sizeOf: (id: string) => number,
  gap: number
): Map<string, { across: number; depth: number }> {
  const at = new Map<string, { across: number; depth: number }>()
  // The nodes in the order they're placed: a subtree is the run of them after its root.
  const order: string[] = []
  let next = 0
  const leaf = (id: string) => (childrenOf.get(id) ?? []).every((c) => at.has(c) || c === id)
  /**
   * Puts a node with children at `middle` (centred on them). A node taller than its children's span (its box and the
   * labels beside it) would poke out past them into its neighbours: its subtree moves down by what it pokes out above,
   * and the next subtree starts below its bottom.
   */
  const centre = (
    id: string,
    depth: number,
    begin: number,
    from: number,
    middle: number
  ): number => {
    const half = sizeOf(id) / 2
    const above = begin - (middle - half)
    if (above > 0) {
      for (const placed of order.slice(from)) {
        const spot = at.get(placed)
        if (spot) at.set(placed, { ...spot, across: spot.across + above })
      }
      middle += above
      next += above
    }
    next = Math.max(next, middle + half + gap)
    at.set(id, { across: middle - half, depth })
    return middle
  }
  const place = (id: string, depth: number): number => {
    const children = (childrenOf.get(id) ?? []).filter((c) => !at.has(c))
    // Claimed before the children are placed: a cycle back to it doesn't place it twice.
    at.set(id, { across: 0, depth })
    order.push(id)
    const from = order.length
    const begin = next
    if (children.length === 0) {
      at.set(id, { across: next, depth })
      next += sizeOf(id) + gap
      return next - sizeOf(id) / 2 - gap
    }
    // Left to right, a long run of leaves (a flat site's pages) fills a grid, a few per column, instead of one tall column.
    if (direction === 'LR' && children.length > RUN && children.every(leaf)) {
      const row = Math.max(...children.map(sizeOf)) + gap
      children.forEach((child, k) => {
        at.set(child, { across: begin + (k % RUN) * row, depth: depth + 1 + Math.floor(k / RUN) })
        order.push(child)
      })
      next = begin + RUN * row
      return centre(id, depth, begin, from, begin + ((RUN - 1) * row) / 2 + (row - gap) / 2)
    }
    // A node's centre sits between its first and last child's centres.
    const centres = children.map((c) => place(c, depth + 1))
    return centre(id, depth, begin, from, (centres[0]! + centres[centres.length - 1]!) / 2)
  }
  for (const root of roots) place(root, 0)
  return at
}
