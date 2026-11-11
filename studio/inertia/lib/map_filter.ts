/** The map's tree: its roots (the sites, and pages hung nowhere) and each node's children, in the order they're drawn. */
export interface MapTree {
  roots: string[]
  childrenOf: Map<string, string[]>
  parentOf: Map<string, string>
}

/** A node and everything under it. */
export function subtree(tree: MapTree, id: string): string[] {
  return [id, ...(tree.childrenOf.get(id) ?? []).flatMap((child) => subtree(tree, child))]
}

/** The nodes above a node, nearest first. */
export function ancestors(tree: MapTree, id: string): string[] {
  const up: string[] = []
  for (let at = tree.parentOf.get(id); at; at = tree.parentOf.get(at)) up.push(at)
  return up
}

/** A node's checkbox: shown with all under it, hidden with all under it, or partly. */
export function checkState(
  tree: MapTree,
  hidden: ReadonlySet<string>,
  id: string
): boolean | 'indeterminate' {
  const all = subtree(tree, id)
  const shown = all.filter((n) => !hidden.has(n)).length
  return shown === all.length ? true : shown === 0 ? false : 'indeterminate'
}

/**
 * The hidden set after a click on a node's box: a node fully shown is hidden with everything under it; otherwise it is
 * shown with everything under it, and the nodes above it are shown so it has a place on the map.
 */
export function toggled(tree: MapTree, hidden: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(hidden)
  if (checkState(tree, hidden, id) === true) for (const n of subtree(tree, id)) next.add(n)
  else for (const n of [...subtree(tree, id), ...ancestors(tree, id)]) next.delete(n)
  return next
}

/** Every node of the tree. */
export function everything(tree: MapTree): string[] {
  return tree.roots.flatMap((root) => subtree(tree, root))
}

/** Only this node and what's under it (and the way down to it). */
export function only(tree: MapTree, id: string): Set<string> {
  const keep = new Set([...subtree(tree, id), ...ancestors(tree, id)])
  return new Set(everything(tree).filter((n) => !keep.has(n)))
}

/** The tree without its hidden nodes (a hidden node hides what's under it). */
export function visibleTree(tree: MapTree, hidden: ReadonlySet<string>): MapTree {
  const childrenOf = new Map<string, string[]>()
  for (const [parent, children] of tree.childrenOf) {
    if (hidden.has(parent)) continue
    childrenOf.set(
      parent,
      children.filter((c) => !hidden.has(c))
    )
  }
  return { roots: tree.roots.filter((r) => !hidden.has(r)), childrenOf, parentOf: tree.parentOf }
}
