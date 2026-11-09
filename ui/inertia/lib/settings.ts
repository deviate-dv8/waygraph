import { useStorage } from '@vueuse/core'

/** How this app plays flows, kept in the viewer's browser (the Settings page). */
export type Settings = {
  /** A demo moves on from each step by itself (`--auto-next`), instead of waiting for Next. */
  autoNext: boolean
}

const DEFAULTS: Settings = { autoNext: true }

/** The settings, saved as they change; a setting added later starts at its default. */
export function useSettings() {
  return useStorage<Settings>('waygraph-settings', DEFAULTS, undefined, { mergeDefaults: true })
}
