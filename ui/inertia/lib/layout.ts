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
 * A tree (a site map): each depth is a column (left to right) or a row (top down); a node's children sit after it in
 * the order given, and the node is centred on them. Several roots sit side by side. Positions are top-left corners.
 */
export function layoutTree(
  roots: string[],
  childrenOf: Map<string, string[]>,
  box: { width: number; height: number },
  direction: TreeDirection = 'LR'
): Map<string, { x: number; y: number }> {
  // Laid out along two axes: across (siblings side by side) and down (one depth after another).
  const across = direction === 'LR' ? box.height : box.width
  const deep = direction === 'LR' ? box.width : box.height
  const gap = direction === 'LR' ? { across: 28, deep: 120 } : { across: 36, deep: 110 }
  const at = new Map<string, { across: number; depth: number }>()
  let next = 0
  const leaf = (id: string) => (childrenOf.get(id) ?? []).every((c) => at.has(c) || c === id)
  const place = (id: string, depth: number): number => {
    const children = (childrenOf.get(id) ?? []).filter((c) => !at.has(c))
    // Claimed before the children are placed: a cycle back to it doesn't place it twice.
    at.set(id, { across: 0, depth })
    if (children.length === 0) {
      at.set(id, { across: next, depth })
      next += across + gap.across
      return next - across - gap.across
    }
    // Left to right, a long run of leaves (a flat site's pages) fills a grid, a few per column, instead of one tall column.
    if (direction === 'LR' && children.length > RUN && children.every(leaf)) {
      const start = next
      children.forEach((child, k) => {
        at.set(child, {
          across: start + (k % RUN) * (across + gap.across),
          depth: depth + 1 + Math.floor(k / RUN),
        })
      })
      next = start + RUN * (across + gap.across)
      const middle = start + ((RUN - 1) * (across + gap.across)) / 2
      at.set(id, { across: middle, depth })
      return middle
    }
    const spots = children.map((c) => place(c, depth + 1))
    const middle = (spots[0]! + spots[spots.length - 1]!) / 2
    at.set(id, { across: middle, depth })
    return middle
  }
  for (const root of roots) place(root, 0)
  const placed = new Map<string, { x: number; y: number }>()
  for (const [id, { across: a, depth }] of at) {
    const d = depth * (deep + gap.deep)
    placed.set(id, direction === 'LR' ? { x: 40 + d, y: 40 + a } : { x: 40 + a, y: 40 + d })
  }
  return placed
}
