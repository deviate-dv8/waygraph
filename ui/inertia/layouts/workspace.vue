<script setup lang="ts">
import { computed, watch } from 'vue'
import { router, usePage } from '@inertiajs/vue3'
import { useIntervalFn } from '@vueuse/core'
import { useToast } from '@nuxt/ui/composables'
import AppLogo from '~/components/app_logo.vue'
import { urlFor } from '~/client'
import { usePlay } from '~/lib/play'
import { appPages } from '~/lib/pages'
import { useSettings } from '~/lib/settings'

/**
 * Every workspace page: a sidebar on the left (the pages, refresh, the colour mode), as n8n and Airflow have it, and
 * the canvas (or a page of content) beside it, under floating islands: the project's name, and what's playing.
 */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string } | null
  scroll?: boolean
}>()

const page = usePage()
const settings = useSettings()
/** The sidebar's pages, without the ones Settings hides; the page you're on shows anyway. */
const sections = computed(() =>
  appPages()
    .filter((p) => !settings.value.hiddenPages.includes(p.id) || p.isAt(page.url))
    .map((p) => ({ label: p.label, icon: p.icon, to: p.to, active: p.isAt(page.url) }))
)
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
    <div class="flex h-dvh w-full">
      <aside class="z-10 shrink-0 p-3 pr-0">
        <nav class="island flex h-full w-16 flex-col items-center gap-1 py-3" aria-label="Waygraph">
          <UTooltip
            :text="props.project ? props.project.dir : 'Waygraph'"
            :content="{ side: 'right' }"
          >
            <ULink :to="urlFor('map')" class="mb-3 px-1" aria-label="Waygraph map"
              ><AppLogo mark
            /></ULink>
          </UTooltip>
          <ULink
            v-for="section in sections"
            :key="section.label"
            :to="section.to"
            class="flex w-13 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px]"
            :class="
              section.active
                ? 'bg-(--color-sketch-100) text-(--color-sketch-700) dark:bg-(--color-sketch-900) dark:text-(--color-sketch-200)'
                : 'text-(--ink-soft) hover:bg-(--island-line) hover:text-(--ink)'
            "
            :aria-current="section.active ? 'page' : undefined"
          >
            <UIcon :name="section.icon" class="size-5" />
            {{ section.label }}
          </ULink>
          <div class="mt-auto flex flex-col items-center gap-1">
            <UTooltip text="Read the project again" :content="{ side: 'right' }">
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
            <UTooltip text="Settings" :content="{ side: 'right' }">
              <UButton
                :to="urlFor('settings')"
                icon="i-lucide-settings"
                size="sm"
                :color="page.url.startsWith('/settings') ? 'primary' : 'neutral'"
                variant="ghost"
                aria-label="Settings"
              />
            </UTooltip>
          </div>
        </nav>
      </aside>

      <main
        class="relative min-w-0 flex-1"
        :class="props.scroll ? 'overflow-y-auto' : 'overflow-hidden'"
      >
        <div :class="props.scroll ? 'mx-auto max-w-5xl px-4 pt-16 pb-16' : 'absolute inset-0'">
          <slot />
        </div>

        <div
          class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3"
        >
          <span
            v-if="props.project"
            class="island pointer-events-auto px-3 py-1.5 text-sm text-(--ink-soft)"
            :title="props.project.dir"
          >
            {{ props.project.name }}
          </span>
          <span v-else />
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
          <span v-else />
        </div>
      </main>
    </div>
  </UApp>
</template>
