/** A Block kind's colour wherever the UI shows one (a badge on a line, in a panel, in the map's key). */
export const KIND_COLOR: Record<string, 'primary' | 'neutral' | 'success' | 'warning' | 'info'> = {
  nav: 'info',
  page: 'info',
  method: 'neutral',
  effect: 'warning',
  api: 'success',
  expect: 'primary',
}

/** The kinds that make moves on the map, in the order its key lists them. */
export const MOVE_KINDS = ['nav', 'method', 'effect', 'api'] as const

/** A kind's colour; one the UI doesn't know is neutral. */
export const kindColor = (kind: string) => KIND_COLOR[kind] ?? 'neutral'
