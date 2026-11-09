/** A node's box in the layout. */
export interface LayoutNode {
  id: string
  width: number
  height: number
}

/**
 * A tree, top to bottom (a site map): each depth is a row; a node's children sit below it in the order given, and the
 * node is centred over them. Several roots sit side by side. Positions are top-left corners.
 */
export function layoutTree(
  roots: string[],
  childrenOf: Map<string, string[]>,
  box: { width: number; height: number },
  gap = { x: 36, y: 110 }
): Map<string, { x: number; y: number }> {
  const placed = new Map<string, { x: number; y: number }>()
  let nextX = 40
  const place = (id: string, depth: number): number => {
    const y = 40 + depth * (box.height + gap.y)
    const children = (childrenOf.get(id) ?? []).filter((c) => !placed.has(c))
    // Claimed before the children are placed: a cycle back to it doesn't place it twice.
    placed.set(id, { x: 0, y })
    if (children.length === 0) {
      placed.set(id, { x: nextX, y })
      nextX += box.width + gap.x
      return nextX - box.width - gap.x
    }
    const xs = children.map((c) => place(c, depth + 1))
    const x = (xs[0]! + xs[xs.length - 1]!) / 2
    placed.set(id, { x, y })
    return x
  }
  for (const root of roots) place(root, 0)
  return placed
}
