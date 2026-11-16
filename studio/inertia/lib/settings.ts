import { useStorage } from '@vueuse/core'

/** How this app plays flows and what its sidebar shows, kept in the viewer's browser (the Settings page). */
export type Settings = {
  /** A demo moves on from each step by itself (`--auto-next`), instead of waiting for Next. */
  autoNext: boolean
  /** The sidebar's pages left out of it, by id (`blocks`, `playwright`...); they still open by their address. */
  hiddenPages: string[]
  /** The pages that are off in the sidebar until asked for (`api`). */
  extraPages: string[]
}

const DEFAULTS: Settings = { autoNext: true, hiddenPages: [], extraPages: [] }

/** The settings, saved as they change; a setting added later starts at its default. */
export function useSettings() {
  return useStorage<Settings>('waygraph-settings', DEFAULTS, undefined, { mergeDefaults: true })
}
