<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import SketchBox from '~/components/sketch/sketch_box.vue'
import RunStatus from '~/components/run_status.vue'
import { urlFor } from '~/client'
import { ago, count } from '~/lib/format'
import type { ManifestFlow, RunSummary } from '#types/project'

/** Every flow in the project: the scenarios, by the page they're about, with how each last ran. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  flows: (ManifestFlow & { lastRun: RunSummary | null })[]
}>()

const query = ref('')
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q
    ? props.flows.filter((f) =>
        `${f.exportName} ${f.file} ${f.steps.join(' ')}`.toLowerCase().includes(q)
      )
    : props.flows
})
const groupOf = (f: ManifestFlow) => (f.useCase.path.length ? f.useCase.path.join(' / ') : 'flows')
const groups = computed(() => {
  const by = new Map<string, typeof shown.value>()
  for (const f of shown.value) by.set(groupOf(f), [...(by.get(groupOf(f)) ?? []), f])
  return [...by.entries()]
})
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <div class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="font-hand text-4xl">Flows</h1>
        <p class="text-(--ink-soft)">
          {{ props.flows.length }} scenarios, each a path through the app's pages.
        </p>
      </div>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Find a flow or a step"
        class="w-72"
      />
    </div>

    <section v-for="[group, inGroup] in groups" :key="group" class="mb-8">
      <h2 class="mb-3 text-sm font-semibold tracking-wide text-(--ink-soft) uppercase">
        {{ group }}
      </h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ULink
          v-for="f in inGroup"
          :key="f.id"
          :to="urlFor('flows.show', { name: f.exportName })"
          class="block"
        >
          <SketchBox :seed="f.id" class="transition-transform hover:-translate-y-0.5">
            <div class="space-y-2 p-4">
              <div class="flex items-start justify-between gap-2">
                <p class="font-hand text-xl leading-tight break-all">{{ f.exportName }}</p>
                <RunStatus v-if="f.lastRun" :id="f.lastRun.id" :ok="f.lastRun.ok" />
              </div>
              <p class="truncate font-mono text-xs text-(--ink-soft)" :title="f.file">
                {{ f.file }}
              </p>
              <p class="text-xs text-(--ink-soft)">
                {{ count(f.steps.length, 'step') }} ·
                {{ count(f.stepExpects.flat().length, 'expectation') }} ·
                {{ f.lastRun ? `last run ${ago(f.lastRun.startedAt)}` : 'never run' }}
              </p>
            </div>
          </SketchBox>
        </ULink>
      </div>
    </section>
    <p v-if="!shown.length" class="text-(--ink-soft)">No flow matches "{{ query }}".</p>
  </WorkspaceLayout>
</template>
