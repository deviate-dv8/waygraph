<script setup lang="ts">
import { computed } from 'vue'
import { router } from '@inertiajs/vue3'
import WorkspaceLayout from '~/layouts/workspace.vue'
import { urlFor } from '~/client'
import type { PlaywrightUi } from '#types/project'

/** Playwright's UI mode over the project's flows, in a frame: each flow a test, with its trace, steps and DOM snapshots. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  server: PlaywrightUi | null
}>()

const running = computed(() => props.server !== null && props.server.exitCode === null)
const url = computed(() => (running.value ? props.server?.url : null) ?? null)
const ended = computed(() => props.server !== null && props.server.exitCode !== null)
/** Over every flow (a flow's page opens it over that flow). */
const start = () => router.post(urlFor('playwright.store'))
const stop = () => router.delete(urlFor('playwright.destroy'))
</script>

<template>
  <WorkspaceLayout :project="props.project">
    <!-- Below the top bar, past the islands' row. -->
    <div v-if="url" class="absolute inset-0 flex flex-col p-3 pt-16">
      <div class="island flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class="flex items-center justify-between gap-2 border-b border-(--island-line) px-3 py-2"
        >
          <p class="text-xs text-(--ink-soft)">
            Playwright UI ·
            <template v-if="props.server?.flow">
              only
              <ULink
                :to="urlFor('flows.show', { name: props.server.flow })"
                class="font-medium hover:underline"
                >{{ props.server.flow }}</ULink
              >
              ·
            </template>
            <template v-else>every flow is a test ·</template>
            <a
              :href="url"
              target="_blank"
              rel="noreferrer"
              class="ml-1 font-mono hover:underline"
              >{{ url }}</a
            >
          </p>
          <span class="flex-1" />
          <UButton
            v-if="props.server?.flow"
            label="Show all flows"
            icon="i-lucide-list"
            size="xs"
            color="neutral"
            variant="outline"
            @click="start()"
          />
          <UButton
            label="Stop"
            icon="i-lucide-square"
            size="xs"
            color="error"
            variant="soft"
            @click="stop"
          />
        </div>
        <iframe :src="url" title="Playwright UI" class="min-h-0 w-full flex-1 bg-white" />
      </div>
    </div>

    <div v-else class="absolute inset-0 flex items-center justify-center p-6">
      <div class="island max-w-md space-y-3 p-6 text-center">
        <h1 class="font-hand text-3xl">Playwright UI</h1>
        <p class="text-sm text-(--ink-soft)">
          Every flow as a Playwright test (<span class="font-mono">waygraph test --flows --ui</span
          >): run them, watch them, and step through each one's trace, actions and page snapshots.
        </p>
        <UButton label="Open Playwright UI" icon="i-lucide-flask-conical" @click="start()" />
        <div v-if="ended && props.server?.output.length" class="text-left">
          <p class="mb-1 text-xs text-(--fail)">It stopped (exit {{ props.server.exitCode }}):</p>
          <pre
            class="max-h-60 overflow-auto rounded border border-(--island-line) p-2 font-mono text-xs whitespace-pre-wrap"
            >{{ props.server.output.slice(-30).join('\n') }}</pre>
        </div>
      </div>
    </div>
  </WorkspaceLayout>
</template>
