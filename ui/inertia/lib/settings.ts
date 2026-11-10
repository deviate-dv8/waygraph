import { useStorage } from '@vueuse/core'

/** How this app plays flows and what its sidebar shows, kept in the viewer's browser (the Settings page). */
export type Settings = {
  /** A demo moves on from each step by itself (`--auto-next`), instead of waiting for Next. */
  autoNext: boolean
  /** Plays record a video of the browser (`--video`); the run's page shows it, to watch or download. */
  video: boolean
  /** The sidebar's pages left out of it, by id (`blocks`, `playwright`...); they still open by their address. */
  hiddenPages: string[]
}

const DEFAULTS: Settings = { autoNext: true, video: false, hiddenPages: [] }

/** The settings, saved as they change; a setting added later starts at its default. */
export function useSettings() {
  return useStorage<Settings>('waygraph-settings', DEFAULTS, undefined, { mergeDefaults: true })
}
