<script setup lang="ts">
import { router } from '@inertiajs/vue3'
import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import WorkspaceLayout from '~/layouts/workspace.vue'
import StepPipeline from '~/components/graph/step_pipeline.vue'
import RunStatus from '~/components/run_status.vue'
import PlayOptions from '~/components/play_options.vue'
import CodeLines from '~/components/code_lines.vue'
import FlowMeta from '~/components/flow_meta.vue'
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

/** What the flow needs from whoever plays it, one JSON box per key, starting from its stub; kept in this browser. */
const inputs = computed(() => props.flow.inputs ?? [])
const typed = useStorage<Record<string, string>>(`waygraph-data:${props.flow.exportName}`, {})
const textOf = (key: string, example: unknown) =>
  typed.value[key] ?? (example === undefined ? '' : JSON.stringify(example, null, 2))
const invalid = computed(() =>
  inputs.value.filter((i) => {
    const text = textOf(i.key, i.example).trim()
    if (!text) return false
    try {
      JSON.parse(text)
      return false
    } catch {
      return true
    }
  })
)
/** Missing, with nothing to fill it from: the run would stop at once asking for it. */
const missing = computed(() =>
  inputs.value.filter((i) => !i.filled && !textOf(i.key, i.example).trim())
)
/** The values to play with: every box that has something, keyed by name. */
const data = computed(() => {
  const given = Object.fromEntries(
    inputs.value
      .map((i) => [i.key, textOf(i.key, i.example).trim()] as const)
      .filter(([, text]) => text)
      .flatMap(([key, text]) => {
        try {
          return [[key, JSON.parse(text)]]
        } catch {
          return []
        }
      })
  )
  return Object.keys(given).length ? JSON.stringify(given) : undefined
})
const canPlay = computed(() => !invalid.value.length && !missing.value.length)

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
/** The flow's own side panel: what it says about itself, or its code with the picked step's line marked. */
const side = ref<'meta' | 'code'>('meta')
const lineOf = computed(() =>
  selected.value === null ? null : (props.flow.stepLines?.[selected.value] ?? null)
)

const { playing, start } = usePlay()
/** Play it with each step's verify only: `--no-expect`. */
const noExpect = ref(false)
</script>

<template>
  <WorkspaceLayout :project="props.project">
    <StepPipeline :steps="pipeline" :selected="selected" @select="selected = $event" />

    <div class="island absolute bottom-3 left-3 max-w-md space-y-1 px-4 py-3">
      <p class="font-hand text-2xl leading-tight">
        {{ props.flow.title ?? props.flow.exportName }}
      </p>
      <p v-if="props.flow.description" class="text-sm">{{ props.flow.description }}</p>
      <p class="font-mono text-xs text-(--ink-soft)">
        {{ props.flow.exportName }} · {{ props.flow.file }}
      </p>
      <div
        v-if="props.flow.labels?.length || props.flow.ticket || props.flow.owner"
        class="flex flex-wrap gap-1"
      >
        <UBadge
          v-for="l in props.flow.labels ?? []"
          :key="l"
          :label="l"
          icon="i-lucide-tag"
          color="primary"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="props.flow.ticket"
          :label="props.flow.ticket"
          icon="i-lucide-ticket"
          color="neutral"
          variant="outline"
          size="sm"
        />
        <UBadge
          v-if="props.flow.owner"
          :label="props.flow.owner"
          icon="i-lucide-user"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>
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
          :disabled="playing || !canPlay"
          @click="start(props.flow.exportName, 'run', { noExpect, data })"
        />
        <UTooltip text="Opens a browser with the step panel around each step">
          <UButton
            label="Demo"
            icon="i-lucide-monitor-play"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="playing || !canPlay"
            @click="start(props.flow.exportName, 'demo', { noExpect, data })"
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
      <div v-if="inputs.length" class="space-y-2 pt-2">
        <p class="text-xs font-semibold text-(--ink-soft) uppercase">Data it is played with</p>
        <div v-for="i in inputs" :key="i.key" class="space-y-1">
          <label class="flex items-center gap-2 font-mono text-xs" :for="`data-${i.key}`">
            {{ i.key }}
            <span class="font-sans text-(--ink-soft)">{{
              i.filled ? 'filled from its stub when left as is' : 'needed to play'
            }}</span>
          </label>
          <textarea
            :id="`data-${i.key}`"
            :value="textOf(i.key, i.example)"
            rows="3"
            spellcheck="false"
            placeholder='JSON, e.g. {"username": "...", "password": "..."}'
            class="w-full rounded border border-(--island-line) bg-transparent p-2 font-mono text-xs"
            :class="invalid.includes(i) ? 'border-(--fail)' : ''"
            @input="typed[i.key] = ($event.target as HTMLTextAreaElement).value"
          />
        </div>
        <p v-if="invalid.length" class="text-xs text-(--fail)">
          {{ invalid.map((i) => i.key).join(', ') }}: not valid JSON.
        </p>
        <p v-else-if="missing.length" class="text-xs text-(--fail)">
          {{ missing.map((i) => i.key).join(', ') }}: give it a value to play.
        </p>
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

      <aside
        class="island pointer-events-auto max-h-[45vh] w-[28rem] space-y-2 overflow-y-auto p-3"
      >
        <div class="flex gap-1">
          <UButton
            label="Meta"
            icon="i-lucide-tags"
            size="xs"
            :color="side === 'meta' ? 'primary' : 'neutral'"
            :variant="side === 'meta' ? 'soft' : 'ghost'"
            @click="side = 'meta'"
          />
          <UButton
            v-if="props.flow.source"
            label="Code"
            icon="i-lucide-code"
            size="xs"
            :color="side === 'code' ? 'primary' : 'neutral'"
            :variant="side === 'code' ? 'soft' : 'ghost'"
            @click="side = 'code'"
          />
        </div>
        <FlowMeta v-if="side === 'meta' || !props.flow.source" :flow="props.flow" />
        <CodeLines v-else :file="props.flow.file" :span="props.flow.source" :active="lineOf" />
        <p
          v-if="side === 'code' && selected !== null && lineOf === null"
          class="text-xs text-(--ink-soft)"
        >
          This step comes from another file.
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
