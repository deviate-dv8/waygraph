<script setup lang="ts">
import { router } from '@inertiajs/vue3'
import { computed, ref } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import StepPipeline from '~/components/graph/step_pipeline.vue'
import RunStatus from '~/components/run_status.vue'
import PlayOptions from '~/components/play_options.vue'
import { urlFor } from '~/client'
import { ago, count, duration } from '~/lib/format'
import { usePlay } from '~/lib/play'
import type { ManifestBlock, ManifestFlow, RunSummary } from '#types/project'

/** One flow: its steps on the canvas, what each expects, and its recent runs. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  flow: ManifestFlow
  steps: { name: string; block: ManifestBlock | null; expects: string[] }[]
  runs: RunSummary[]
}>()

const selected = ref<number | null>(null)
const pipeline = computed(() =>
  props.steps.map((s, i) => ({
    pane: props.flow.stepPanes?.[i] ?? null,
    name: s.name,
    // A Block written in a page is its page's move, expectation or link.
    kind: s.block?.group
      ? { do: 'move', expects: 'expect', links: 'link' }[s.block.group]
      : (s.block?.kind ?? 'step'),
    description: s.block?.description ?? '',
    ...(s.block?.url ? { url: s.block.url } : {}),
    expects: s.expects,
  }))
)
const step = computed(() =>
  selected.value === null ? null : (props.steps[selected.value] ?? null)
)
const settings = computed(() => Object.entries(props.flow.settings))

const { playing, start } = usePlay()
/** Play it with each step's verify only: `--no-expect`. */
const noExpect = ref(false)
</script>

<template>
  <WorkspaceLayout :project="props.project">
    <StepPipeline :steps="pipeline" :selected="selected" @select="selected = $event" />

    <div class="island absolute bottom-3 left-3 max-w-md space-y-1 px-4 py-3">
      <p class="font-hand text-2xl leading-tight">{{ props.flow.exportName }}</p>
      <p class="font-mono text-xs text-(--ink-soft)">{{ props.flow.file }}</p>
      <div class="flex flex-wrap gap-1 pt-1">
        <UBadge
          v-for="[k, v] in settings"
          :key="k"
          :label="v === true ? k : `${k}: ${v}`"
          color="neutral"
          variant="outline"
          size="sm"
        />
        <UBadge
          :label="count(props.steps.length, 'step')"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-2">
        <UButton
          label="Run"
          icon="i-lucide-play"
          size="sm"
          :disabled="playing"
          @click="start(props.flow.exportName, 'run', { noExpect })"
        />
        <UTooltip text="Opens a browser with the step panel around each step">
          <UButton
            label="Demo"
            icon="i-lucide-monitor-play"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="playing"
            @click="start(props.flow.exportName, 'demo', { noExpect })"
          />
        </UTooltip>
        <UTooltip text="This flow as a Playwright test: run it, watch it, step through its trace">
          <UButton
            label="Playwright UI"
            icon="i-lucide-flask-conical"
            size="sm"
            color="neutral"
            variant="outline"
            @click="router.post(urlFor('playwright.store'), { flow: props.flow.exportName })"
          />
        </UTooltip>
        <UCheckbox v-model="noExpect" label="verify only" size="sm" />
      </div>
      <PlayOptions class="pt-1" />
    </div>

    <div
      class="pointer-events-none absolute inset-y-0 right-0 flex flex-col items-end gap-3 p-3 pt-16"
    >
      <aside v-if="step" class="island pointer-events-auto w-80 space-y-3 p-4">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs text-(--ink-soft) uppercase">
              step {{ (selected ?? 0) + 1 }} · {{ step.block?.kind ?? 'step' }}
            </p>
            <h2 class="font-hand text-2xl leading-tight break-words">{{ step.name }}</h2>
          </div>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Close"
            @click="selected = null"
          />
        </div>
        <p v-if="step.block?.description" class="text-sm">{{ step.block.description }}</p>
        <p v-if="step.block" class="text-xs text-(--ink-soft)">
          {{
            step.block.from.includes('*') ? 'from anywhere' : `from ${step.block.from.join(', ')}`
          }}
          → {{ step.block.to.join(' or ') }}
        </p>
        <div v-if="step.expects.length">
          <p class="mb-1 text-sm font-semibold">Expects</p>
          <ul class="list-inside list-disc space-y-0.5 text-sm">
            <li v-for="(e, i) in step.expects" :key="i">{{ e }}</li>
          </ul>
        </div>
        <div v-if="step.block?.requires.length">
          <p class="mb-1 text-sm font-semibold">Reads from mem</p>
          <p class="font-mono text-xs">{{ step.block.requires.join(', ') }}</p>
        </div>
        <p
          v-if="step.block"
          class="truncate font-mono text-xs text-(--ink-soft)"
          :title="step.block.file"
        >
          {{ step.block.file }}
        </p>
      </aside>

      <aside class="island pointer-events-auto w-80 p-3">
        <p class="mb-2 text-sm font-semibold">Recent runs</p>
        <p v-if="!props.runs.length" class="text-xs text-(--ink-soft)">Not run yet.</p>
        <ul class="space-y-1">
          <li v-for="r in props.runs.slice(0, 8)" :key="r.id" class="flex items-center gap-1">
            <ULink
              :to="urlFor('runs.show', { id: r.id })"
              class="flex flex-1 items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-(--island-line)"
            >
              <span class="flex items-center gap-2"
                ><RunStatus :id="r.id" :ok="r.ok" /> {{ ago(r.startedAt) }}</span
              >
              <span class="text-xs text-(--ink-soft)">{{ duration(r.ms) }}</span>
            </ULink>
            <UTooltip v-for="v in r.videos" :key="v" text="Download its video">
              <UButton
                :href="`${urlFor('runs.artifact', { id: r.id, index: v })}?download`"
                external
                icon="i-lucide-download"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Download its video"
              />
            </UTooltip>
          </li>
        </ul>
      </aside>
    </div>
  </WorkspaceLayout>
</template>
