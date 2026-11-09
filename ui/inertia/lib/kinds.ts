/** A Block kind's colour wherever the UI shows one (a badge on a line, in a panel, in the map's key). */
export const KIND_COLOR: Record<string, 'primary' | 'neutral' | 'success' | 'warning' | 'info'> = {
  nav: 'info',
  page: 'info',
  method: 'neutral',
  api: 'success',
  expect: 'primary',
}

/** The kinds that make moves on the map, in the order its key lists them. */
export const MOVE_KINDS = ['nav', 'method', 'api'] as const

/** A kind's colour; one the UI doesn't know (an old run's `effect`, now a Method) is neutral, a Method's. */
export const kindColor = (kind: string) => KIND_COLOR[kind] ?? 'neutral'
