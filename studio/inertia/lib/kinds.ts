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

/** A Block kind's icon, beside its colour: on a line's badges, in the map's key and its legend. */
export const KIND_ICON: Record<string, string> = {
  nav: 'i-lucide-compass',
  page: 'i-lucide-file-text',
  method: 'i-lucide-mouse-pointer-click',
  api: 'i-lucide-plug-zap',
  expect: 'i-lucide-badge-check',
}

/** A kind's icon; one the UI doesn't know shows a Method's. */
export const kindIcon = (kind: string) => KIND_ICON[kind] ?? KIND_ICON.method!

/** What each kind of Block does, in a line: the legend's words. */
export const KIND_MEANING: Record<string, string> = {
  nav: 'goes to a page: by its address, or a click in the app',
  method: 'one action on a page: a click, a field filled, a submit',
  api: "a call to the app's API, no page",
  expect: 'what a scenario expects on a page; only reads',
}
