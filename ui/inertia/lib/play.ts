import { computed } from 'vue'
import { router, usePage } from '@inertiajs/vue3'
import { urlFor } from '~/client'
import { useSettings } from '~/lib/settings'
import type { PlayMode } from '#types/project'

/** The flow the app is playing (or played last), shared with every page, and how to start and stop one. */
export function usePlay() {
  const page = usePage()
  const settings = useSettings()
  const play = computed(() => page.props.play ?? null)
  const playing = computed(() => play.value !== null && play.value.exitCode === null)
  return {
    play,
    playing,
    /** Whether this run is the one playing now. */
    isPlaying: (runId: string) => playing.value && play.value?.runId === runId,
    /** Plays a flow; a demo auto-advances as the Settings page says. */
    start: (flow: string, mode: PlayMode, options: { noExpect?: boolean; replay?: string } = {}) =>
      router.post(urlFor('plays.store'), {
        flow,
        mode,
        ...options,
        video: settings.value.video,
        ...(mode === 'demo' ? { autoNext: settings.value.autoNext } : {}),
      }),
    stop: () => router.delete(urlFor('plays.destroy')),
  }
}
