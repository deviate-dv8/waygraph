<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import RunStatus from '~/components/run_status.vue'
import { urlFor } from '~/client'
import { PREFETCH } from '~/lib/prefetch'
import { ago, count } from '~/lib/format'
import type { FlowRow } from '#types/project'

/** Every flow in the project: the scenarios, by the folder they're in, failing first, with how each last ran. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  flows: FlowRow[]
}>()

const query = ref('')
/** The config's labels, by how many flows have each; picking one shows only its flows. */
const label = ref<string | null>(null)
const labelCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const f of props.flows) for (const l of f.labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts]
})
const status = ref<'all' | 'failing' | 'passing' | 'never'>('all')
const statusOf = (f: FlowRow) =>
  !f.lastRun ? 'never' : f.lastRun.ok === false ? 'failing' : f.lastRun.ok ? 'passing' : 'never'
const tally = computed(() => ({
  failing: props.flows.filter((f) => statusOf(f) === 'failing').length,
  passing: props.flows.filter((f) => statusOf(f) === 'passing').length,
  never: props.flows.filter((f) => statusOf(f) === 'never').length,
}))
const filters = computed(() => [
  { label: `All ${props.flows.length}`, value: 'all' },
  { label: `Failing ${tally.value.failing}`, value: 'failing' },
  { label: `Passing ${tally.value.passing}`, value: 'passing' },
  { label: `Not run ${tally.value.never}`, value: 'never' },
])
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.flows.filter(
    (f) =>
      (status.value === 'all' || statusOf(f) === status.value) &&
      (!label.value || f.labels.includes(label.value)) &&
      (!q ||
        `${f.name} ${f.title ?? ''} ${f.description ?? ''} ${f.ticket ?? ''} ${f.file} ${f.stepNames}`
          .toLowerCase()
          .includes(q))
  )
})
/** Groups by folder; within one, failing flows first, then by name. */
const groups = computed(() => {
  const by = new Map<string, FlowRow[]>()
  for (const f of shown.value) by.set(f.group, [...(by.get(f.group) ?? []), f])
  const rank = (f: FlowRow) => (statusOf(f) === 'failing' ? 0 : 1)
  return [...by]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, list]) => ({
      group,
      failing: list.filter((f) => statusOf(f) === 'failing').length,
      flows: [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)),
    }))
})
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-hand text-4xl">Flows</h1>
        <p class="text-(--ink-soft)">
          {{ count(props.flows.length, 'scenario') }}, each a path through the app's pages.
        </p>
      </div>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Find a flow or a step"
        class="w-72"
      />
    </div>
    <UTabs v-model="status" :items="filters" :content="false" size="sm" class="mb-3" />
    <div v-if="labelCounts.length" class="mb-5 flex flex-wrap items-center gap-1.5">
      <UIcon name="i-lucide-tag" class="size-4 text-(--ink-soft)" />
      <UButton
        v-for="[l, n] in labelCounts"
        :key="l"
        :label="`${l} ${n}`"
        size="xs"
        :color="label === l ? 'primary' : 'neutral'"
        variant="soft"
        @click="label = label === l ? null : l"
      />
    </div>

    <section v-for="g in groups" :key="g.group" class="mb-5">
      <h2 class="mb-2 flex items-center gap-2 font-mono text-sm text-(--ink-soft)">
        <UIcon name="i-lucide-folder" class="size-4" /> {{ g.group }}
        <UBadge :label="String(g.flows.length)" color="neutral" variant="subtle" size="sm" />
        <UBadge
          v-if="g.failing"
          :label="`${g.failing} failing`"
          color="error"
          variant="subtle"
          size="sm"
        />
      </h2>
      <ul class="island divide-y divide-(--island-line)">
        <li v-for="f in g.flows" :key="f.id">
          <ULink
            :to="urlFor('flows.show', { name: f.name })"
            v-bind="PREFETCH"
            class="flex items-center gap-3 px-4 py-2 hover:bg-(--island-line)"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium" :title="f.name">{{ f.title ?? f.name }}</p>
              <p
                v-if="f.description"
                class="truncate text-xs text-(--ink-soft)"
                :title="f.description"
              >
                {{ f.description }}
              </p>
              <p class="truncate font-mono text-[11px] text-(--ink-soft)" :title="f.file">
                {{ f.title ? `${f.name} · ` : '' }}{{ f.file }}
              </p>
            </div>
            <UBadge
              v-for="l in f.labels"
              :key="l"
              :label="l"
              icon="i-lucide-tag"
              color="primary"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-if="f.ticket"
              :label="f.ticket"
              icon="i-lucide-ticket"
              color="neutral"
              variant="outline"
              size="sm"
            />
            <UBadge :label="count(f.steps, 'step')" color="neutral" variant="outline" size="sm" />
            <UBadge
              v-if="f.expectations"
              :label="count(f.expectations, 'expectation')"
              color="primary"
              variant="subtle"
              size="sm"
              class="hidden sm:inline-flex"
            />
            <span class="hidden w-28 shrink-0 text-right text-xs text-(--ink-soft) md:block">
              {{ f.lastRun ? ago(f.lastRun.startedAt) : 'never run' }}
            </span>
            <RunStatus v-if="f.lastRun" :id="f.lastRun.id" :ok="f.lastRun.ok" />
            <span v-else class="w-5" />
          </ULink>
        </li>
      </ul>
    </section>
    <p v-if="!shown.length" class="text-(--ink-soft)">No flow matches.</p>
  </WorkspaceLayout>
</template>
