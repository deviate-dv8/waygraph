<script setup lang="ts">
import { computed, watch } from 'vue'
import { router, usePage } from '@inertiajs/vue3'
import { useIntervalFn } from '@vueuse/core'
import { useToast } from '@nuxt/ui/composables'
import AppLogo from '~/components/app_logo.vue'
import { urlFor } from '~/client'
import { usePlay } from '~/lib/play'

/**
 * Every workspace page: the canvas (or a page of content) under floating islands - the project and its tabs on the
 * left, refresh and the colour mode on the right - as Excalidraw lays out its toolbars.
 */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string } | null
  scroll?: boolean
}>()

const page = usePage()
const tabs = computed(() => [
  {
    label: 'Map',
    icon: 'i-lucide-map',
    to: urlFor('map'),
    active: page.url === '/' || page.url.startsWith('/?'),
  },
  {
    label: 'Flows',
    icon: 'i-lucide-route',
    to: urlFor('flows.index'),
    active: page.url.startsWith('/flows'),
  },
  {
    label: 'Runs',
    icon: 'i-lucide-history',
    to: urlFor('runs.index'),
    active: page.url.startsWith('/runs'),
  },
])
const fresh = computed(() => `${page.url.split('?')[0]}?fresh=1`)

const { play, playing, stop } = usePlay()
// While a flow plays, read the page again every second: its run grows step by step.
const polling = useIntervalFn(() => router.reload(), 1000, { immediate: false })
watch(playing, (now) => (now ? polling.resume() : polling.pause()), { immediate: true })
/** A play that ended without starting a run: what it printed says why. */
const didNotStart = computed(
  () =>
    play.value !== null && !playing.value && play.value.runId === null && play.value.exitCode !== 0
)

const toast = useToast()
watch(
  () => page.flash,
  (flash) => {
    if (flash?.error)
      toast.add({ title: String(flash.error), color: 'error', icon: 'i-lucide-circle-alert' })
    if (flash?.success)
      toast.add({ title: String(flash.success), color: 'success', icon: 'i-lucide-check' })
  },
  { immediate: true }
)
</script>

<template>
  <UApp>
    <div
      class="relative h-dvh w-full"
      :class="props.scroll ? 'overflow-y-auto' : 'overflow-hidden'"
    >
      <div :class="props.scroll ? 'mx-auto max-w-5xl px-4 pt-24 pb-16' : 'absolute inset-0'">
        <slot />
      </div>

      <header
        class="pointer-events-none fixed inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3"
      >
        <nav class="island pointer-events-auto flex items-center gap-1 p-1.5">
          <ULink :to="urlFor('map')" class="px-2" aria-label="Waygraph map"><AppLogo /></ULink>
          <span
            v-if="props.project"
            class="hidden border-l border-(--island-line) px-3 text-sm text-(--ink-soft) sm:inline"
            :title="props.project.dir"
          >
            {{ props.project.name }}
          </span>
          <UButton
            v-for="tab in tabs"
            :key="tab.label"
            :to="tab.to"
            :icon="tab.icon"
            :label="tab.label"
            size="sm"
            :color="tab.active ? 'primary' : 'neutral'"
            :variant="tab.active ? 'soft' : 'ghost'"
          />
        </nav>
        <div
          v-if="play && (playing || didNotStart)"
          class="island pointer-events-auto flex max-w-md items-center gap-2 py-1.5 pr-1.5 pl-3 text-sm"
        >
          <template v-if="playing">
            <UIcon name="i-lucide-loader" class="size-4 animate-spin text-(--run)" />
            <span class="truncate">
              {{ play.mode === 'demo' ? 'Demo of' : 'Playing' }}
              <span class="font-hand text-base">{{ play.flow }}</span>
            </span>
            <UButton
              v-if="play.runId && page.url !== `/runs/${play.runId}`"
              :to="urlFor('runs.show', { id: play.runId })"
              label="Follow"
              size="xs"
              color="neutral"
              variant="outline"
            />
            <UButton
              label="Stop"
              icon="i-lucide-square"
              size="xs"
              color="error"
              variant="soft"
              @click="stop()"
            />
          </template>
          <template v-else>
            <UIcon name="i-lucide-circle-alert" class="size-4 text-(--fail)" />
            <span class="truncate">
              <span class="font-hand text-base">{{ play.flow }}</span> didn't start
            </span>
            <UPopover>
              <UButton label="Output" size="xs" color="neutral" variant="outline" />
              <template #content>
                <pre
                  class="max-h-96 max-w-2xl overflow-auto p-3 font-mono text-xs whitespace-pre-wrap"
                  >{{ play.output.join('\n') || 'It printed nothing.' }}</pre>
              </template>
            </UPopover>
          </template>
        </div>
        <div class="island pointer-events-auto flex items-center gap-1 p-1.5">
          <UTooltip text="Read the project again">
            <UButton
              :to="fresh"
              icon="i-lucide-refresh-cw"
              size="sm"
              color="neutral"
              variant="ghost"
              aria-label="Refresh"
            />
          </UTooltip>
          <UColorModeButton size="sm" />
        </div>
      </header>
    </div>
  </UApp>
</template>
