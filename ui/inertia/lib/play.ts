import { computed } from 'vue'
import { router, usePage } from '@inertiajs/vue3'
import { urlFor } from '~/client'
import type { PlayMode } from '#types/project'

/** The flow the app is playing (or played last), shared with every page, and how to start and stop one. */
export function usePlay() {
  const page = usePage()
  const play = computed(() => page.props.play ?? null)
  const playing = computed(() => play.value !== null && play.value.exitCode === null)
  return {
    play,
    playing,
    /** Whether this run is the one playing now. */
    isPlaying: (runId: string) => playing.value && play.value?.runId === runId,
    start: (flow: string, mode: PlayMode, options: { noExpect?: boolean; replay?: string } = {}) =>
      router.post(urlFor('plays.store'), { flow, mode, ...options }),
    stop: () => router.delete(urlFor('plays.destroy')),
  }
}
