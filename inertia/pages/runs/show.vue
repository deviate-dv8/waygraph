<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import StepPipeline from '~/components/graph/step_pipeline.vue'
import RunStatus from '~/components/run_status.vue'
import { urlFor } from '~/client'
import { ago, count, duration } from '~/lib/format'
import { runTitle } from '~/lib/runs'
import type { RunDetail } from '#types/project'

/** One run: its steps on the canvas, coloured by how each went, and the failure, the page's data and the mem it used. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  run: RunDetail
}>()

const failedIndex = props.run.stepsList.findIndex((s) => s.status === 'failed')
const selected = ref<number | null>(failedIndex >= 0 ? failedIndex : null)
const pipeline = computed(() =>
  props.run.stepsList.map((s) => ({
    name: s.block,
    kind: s.kind,
    description: s.cleanup ? 'cleanup' : `${s.from} → ${s.to ?? '?'}`,
    expects: [],
    status: s.status,
    ms: s.ms,
  }))
)
const step = computed(() =>
  selected.value === null ? null : (props.run.stepsList[selected.value] ?? null)
)
</script>

<template>
  <WorkspaceLayout :project="props.project">
    <StepPipeline :steps="pipeline" :selected="selected" @select="selected = $event" />

    <div class="island absolute bottom-3 left-3 max-w-lg space-y-1 px-4 py-3">
      <div class="flex items-center gap-2">
        <RunStatus :ok="props.run.ok" size="md" />
        <p class="font-hand text-2xl leading-tight">{{ runTitle(props.run) }}</p>
      </div>
      <p class="text-xs text-(--ink-soft)">
        {{ ago(props.run.startedAt) }} · {{ duration(props.run.ms) }} ·
        {{ count(props.run.steps, 'step') }} · <span class="font-mono">{{ props.run.id }}</span>
      </p>
      <div v-if="props.run.flows.length" class="flex gap-1 pt-1">
        <UButton
          v-for="f in props.run.flows"
          :key="f"
          :to="urlFor('flows.show', { name: f })"
          :label="`flow ${f}`"
          icon="i-lucide-route"
          size="xs"
          color="neutral"
          variant="outline"
        />
      </div>
    </div>

    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-start p-3 pt-20">
      <aside
        v-if="step"
        class="island pointer-events-auto flex max-h-full w-96 flex-col overflow-hidden"
      >
        <div class="flex items-start justify-between border-b border-(--island-line) p-4">
          <div>
            <p class="text-xs text-(--ink-soft) uppercase">
              step {{ step.index + 1 }} · {{ step.kind }} · {{ duration(step.ms) }}
            </p>
            <h2 class="font-hand text-2xl leading-tight break-words">{{ step.block }}</h2>
            <p class="text-xs text-(--ink-soft)">
              {{ step.from }} → {{ step.to ?? 'failed before landing' }}
            </p>
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
        <div class="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          <div
            v-if="step.status === 'failed'"
            class="space-y-2 rounded-lg border border-(--fail) p-3"
          >
            <p class="font-semibold text-(--fail)">
              {{ step.check?.when === 'expect' ? 'An expectation failed' : 'It failed' }}
            </p>
            <template v-if="step.check">
              <p><span class="text-(--ink-soft)">check</span> {{ step.check.trait }}</p>
              <p v-if="step.check.wants">
                <span class="text-(--ink-soft)">wanted</span> {{ step.check.wants }}
              </p>
              <p v-if="step.check.saw">
                <span class="text-(--ink-soft)">saw</span> {{ step.check.saw }}
              </p>
              <p v-if="step.check.url" class="font-mono text-xs text-(--ink-soft)">
                {{ step.check.url }}
              </p>
            </template>
            <pre class="max-h-48 overflow-auto text-xs whitespace-pre-wrap">{{ step.error }}</pre>
          </div>
          <div v-if="step.read">
            <p class="mb-1 font-semibold">The page showed</p>
            <pre class="max-h-72 overflow-auto rounded-lg bg-(--island-line) p-2 text-xs">{{
              JSON.stringify(step.read, null, 2)
            }}</pre>
          </div>
          <div v-if="props.run.mem.length">
            <p class="mb-1 font-semibold">Mem it was given</p>
            <div v-for="m in props.run.mem" :key="m.flow" class="mb-2">
              <p class="text-xs text-(--ink-soft)">{{ m.flow }}</p>
              <pre class="max-h-40 overflow-auto rounded-lg bg-(--island-line) p-2 text-xs">{{
                JSON.stringify(m.values, null, 2)
              }}</pre>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </WorkspaceLayout>
</template>
