import { computed } from 'vue'
import { router, usePage } from '@inertiajs/vue3'
import { useStorage } from '@vueuse/core'
import { urlFor } from '~/client'
import { useSettings } from '~/lib/settings'
import type { PlayMode } from '#types/project'

/** How a flow plays from here, chosen next to Run and Demo and kept in this browser. */
export type PlayOptions = {
  /** Record a video (`--video`): the run's page plays it and downloads it. */
  video: boolean
  /** Show the browser while it plays; off, it plays headless. */
  headed: boolean
}

/** The play options, as the switches next to Run and Demo left them. */
export function usePlayOptions() {
  return useStorage<PlayOptions>(
    'waygraph-play-options',
    { video: false, headed: true },
    undefined,
    { mergeDefaults: true }
  )
}

/** The flow the app is playing (or played last), shared with every page, and how to start and stop one. */
export function usePlay() {
  const page = usePage()
  const settings = useSettings()
  const options = usePlayOptions()
  const play = computed(() => page.props.play ?? null)
  const playing = computed(() => play.value !== null && play.value.exitCode === null)
  return {
    play,
    playing,
    /** Whether this run is the one playing now. */
    isPlaying: (runId: string) => playing.value && play.value?.runId === runId,
    /** Plays a flow as the play options say; a demo auto-advances as the Settings page says. */
    start: (flow: string, mode: PlayMode, given: { noExpect?: boolean; replay?: string } = {}) =>
      router.post(urlFor('plays.store'), {
        flow,
        mode,
        ...given,
        video: options.value.video,
        headed: options.value.headed,
        ...(mode === 'demo' ? { autoNext: settings.value.autoNext } : {}),
      }),
    stop: () => router.delete(urlFor('plays.destroy')),
  }
}
