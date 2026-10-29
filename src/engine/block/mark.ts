// Runtime markers on a Block: what kind it is, its route, how it navigates. map(), `waygraph check`, the graph and the
// demo read them; Object.keys, JSON and autocomplete never show them.

/** Sets one marker (configurable, so a decorated copy can carry it on). */
export function mark(block: object, name: string, value: unknown): void {
  Object.defineProperty(block, name, { value, enumerable: false, configurable: true });
}
