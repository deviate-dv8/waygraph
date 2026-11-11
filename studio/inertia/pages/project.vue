<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { router } from '@inertiajs/vue3'
import { useIntervalFn } from '@vueuse/core'
import WorkspaceLayout from '~/layouts/workspace.vue'
import { urlFor } from '~/client'
import { duration } from '~/lib/format'
import type { CommandJob, CommandSpec, Json } from '#types/project'

/** The project: its waygraph config (as written, and what waygraph resolves it to), and a button for each command. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  config: { file: string; values: Json; source: string | null } | null
  commands: (CommandSpec & { name: string })[]
  job: CommandJob | null
}>()

const groups = computed(() => {
  const by = new Map<string, typeof props.commands>()
  for (const c of props.commands) by.set(c.group, [...(by.get(c.group) ?? []), c])
  return [...by]
})
const running = computed(() => props.job !== null && props.job.exitCode === null)
/** How the command went, in an icon and words: running, stopped (by Stop), or its exit code and time. */
const status = computed(() => {
  const job = props.job
  if (!job || running.value)
    return { icon: 'i-lucide-loader', class: 'animate-spin', text: 'running' }
  if (job.stopped) return { icon: 'i-lucide-square', class: 'text-(--ink-soft)', text: 'stopped' }
  const took = duration((job.endedAt ?? job.startedAt) - job.startedAt)
  return job.exitCode === 0
    ? { icon: 'i-lucide-check', class: 'text-(--pass)', text: `exit 0 · ${took}` }
    : { icon: 'i-lucide-x', class: 'text-(--fail)', text: `exit ${job.exitCode} · ${took}` }
})
// While a command runs, read what it printed each second.
const polling = useIntervalFn(() => router.reload({ only: ['job'] }), 1000, { immediate: false })
watch(running, (now) => (now ? polling.resume() : polling.pause()), { immediate: true })

const confirming = ref<(CommandSpec & { name: string }) | null>(null)
const run = (c: CommandSpec & { name: string }) => {
  if (c.writes && confirming.value?.name !== c.name) {
    confirming.value = c
    return
  }
  confirming.value = null
  router.post(urlFor('project.commands.store'), { name: c.name })
}
const stop = () => router.delete(urlFor('project.commands.destroy'))
const configView = ref<'resolved' | 'file'>('resolved')
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <h1 class="font-hand text-4xl">Project</h1>
    <p class="mb-6 font-mono text-sm text-(--ink-soft)">{{ props.project.dir }}</p>

    <section class="mb-8">
      <h2 class="mb-1 flex items-center gap-1.5 text-lg font-semibold">
        <UIcon name="i-lucide-terminal" class="size-5 text-(--ink-soft)" /> Commands
      </h2>
      <p class="mb-3 text-sm text-(--ink-soft)">
        The project's own waygraph, as from a terminal in its folder. One at a time; Stop ends it
        and what it started.
      </p>
      <div class="island space-y-4 p-4">
        <div v-for="[group, items] in groups" :key="group">
          <p class="mb-1.5 text-xs font-semibold tracking-wide text-(--ink-soft) uppercase">
            {{ group }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <UTooltip v-for="c in items" :key="c.name" :text="c.help">
              <UButton
                :label="c.label"
                size="sm"
                :color="c.writes ? 'warning' : 'neutral'"
                variant="outline"
                class="font-mono"
                :disabled="running"
                @click="run(c)"
              />
            </UTooltip>
          </div>
        </div>
        <UAlert
          v-if="confirming"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`waygraph ${confirming.label} changes the project's files`"
          description="Commit or stash first, so you can see and undo what it did."
          :actions="[
            {
              label: `Run ${confirming.label}`,
              color: 'warning',
              onClick: () => confirming && run(confirming),
            },
            {
              label: 'Cancel',
              color: 'neutral',
              variant: 'ghost',
              onClick: () => (confirming = null),
            },
          ]"
        />
      </div>
      <div v-if="props.job" class="island mt-3 overflow-hidden">
        <div class="flex items-center gap-2 border-b border-(--island-line) px-4 py-2 text-sm">
          <UIcon :name="status.icon" class="size-4" :class="status.class" />
          <span class="font-mono">{{ props.job.command }}</span>
          <span class="text-xs text-(--ink-soft)">{{ status.text }}</span>
          <span class="flex-1" />
          <UButton
            v-if="running"
            label="Stop"
            icon="i-lucide-square"
            size="xs"
            color="error"
            variant="soft"
            @click="stop"
          />
        </div>
        <pre class="max-h-[32rem] overflow-auto p-4 font-mono text-xs whitespace-pre-wrap">{{
          props.job.output.join('\n') || '…'
        }}</pre>
      </div>
    </section>

    <section>
      <h2 class="mb-1 flex items-center gap-1.5 text-lg font-semibold">
        <UIcon name="i-lucide-settings-2" class="size-5 text-(--ink-soft)" /> Config
      </h2>
      <template v-if="props.config">
        <p class="mb-3 text-sm text-(--ink-soft)">
          <span class="font-mono">{{ props.config.file }}</span
          >: how waygraph runs this project (its base url, extensions, video, demo pace,
          Playwright's options). Resolved: what it gives after the environment (<span
            class="font-mono"
            >.env</span
          >, <span class="font-mono">BASE_URL</span>) is read; a function shows as a word.
        </p>
        <UTabs
          v-model="configView"
          :items="[
            { label: 'Resolved', value: 'resolved' },
            { label: 'As written', value: 'file' },
          ]"
          :content="false"
          size="sm"
          class="mb-2 w-72"
        />
        <pre class="island max-h-[36rem] overflow-auto p-4 font-mono text-xs">{{
          configView === 'resolved'
            ? JSON.stringify(props.config.values, null, 2)
            : (props.config.source ?? 'The file could not be read.')
        }}</pre>
      </template>
      <p v-else class="text-sm text-(--ink-soft)">
        No config: the project has no <span class="font-mono">waygraph.config.*</span>, or its
        waygraph is older than 0.16.18 and doesn't say.
      </p>
    </section>
  </WorkspaceLayout>
</template>
