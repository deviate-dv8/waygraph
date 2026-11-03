import { Graph, layout as dagreLayout } from '@dagrejs/dagre'

export interface LayoutNode {
  id: string
  width: number
  height: number
}

export interface LayoutEdge {
  source: string
  target: string
}

/** Where each node goes, left to right in the order the edges run (dagre), as top-left corners. */
export function layoutLeftToRight(
  nodes: LayoutNode[],
  edges: LayoutEdge[]
): Map<string, { x: number; y: number }> {
  const g = new Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 140, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of edges) if (e.source !== e.target) g.setEdge(e.source, e.target)
  dagreLayout(g)
  const placed = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const at = g.node(n.id)
    placed.set(n.id, { x: at.x - n.width / 2, y: at.y - n.height / 2 })
  }
  return placed
}
