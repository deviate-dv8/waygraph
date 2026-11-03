<script setup lang="ts">
import { computed } from 'vue'
import { usePage } from '@inertiajs/vue3'
import AppLogo from '~/components/app_logo.vue'
import { urlFor } from '~/client'

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
