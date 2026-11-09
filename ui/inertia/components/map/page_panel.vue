<script setup lang="ts">
import { computed } from 'vue'
import type { PageSummary } from '~/lib/project_graph'
import { kindColor } from '~/lib/kinds'
import ShapeTree from '~/components/map/shape_tree.vue'
import RunStatus from '~/components/run_status.vue'
import { urlFor } from '~/client'
import type { Json, ManifestBlock, PageFlow } from '#types/project'

/** The selected page: its addresses, how you get there, what you can do and expect there, where it leads, what it shows. */
const props = defineProps<{
  page: PageSummary
  urls: string[]
  image?: string | undefined
  /** The flows that pass through it, with how each one's newest run went. */
  flows: PageFlow[]
}>()
defineEmits<{ close: [] }>()

const sections: {
  title: string
  icon: string
  key: 'waysIn' | 'actions' | 'expects' | 'leadsTo'
  empty: string
}[] = [
  { title: 'Ways in', icon: 'i-lucide-log-in', key: 'waysIn', empty: 'Nothing navigates here.' },
  {
    title: 'Do here',
    icon: 'i-lucide-mouse-pointer-click',
    key: 'actions',
    empty: 'No actions on this page.',
  },
  {
    title: 'Expect here',
    icon: 'i-lucide-badge-check',
    key: 'expects',
    empty: 'No Expect Blocks for this page.',
  },
  {
    title: 'Leads to',
    icon: 'i-lucide-log-out',
    key: 'leadsTo',
    empty: 'Nothing leaves from here.',
  },
]
/** A Read Block's fields by namespace (`catalog.items`, `catalog.sort` under `catalog`), each field by its own name. */
const byNamespace = (fields: Record<string, Json>): [string, [string, Json][]][] => {
  const groups = new Map<string, [string, Json][]>()
  for (const [key, shape] of Object.entries(fields)) {
    const dot = key.indexOf('.')
    const [ns, field] = dot > 0 ? [key.slice(0, dot), key.slice(dot + 1)] : ['', key]
    groups.set(ns, [...(groups.get(ns) ?? []), [field, shape]])
  }
  return [...groups]
}

/** Its flows, those that land here first, then those that may, then those that only act here; by name within each. */
const REACH_ORDER: PageFlow['reach'][] = ['lands', 'may land', 'acts']
const sortedFlows = computed(() =>
  [...props.flows].sort(
    (a, b) =>
      REACH_ORDER.indexOf(a.reach) - REACH_ORDER.indexOf(b.reach) || a.name.localeCompare(b.name)
  )
)
/** The flows in two lines: how many get here each way, and how their newest runs went. */
const flowSummary = computed(() => {
  const of = (test: (f: PageFlow) => boolean) => props.flows.filter(test).length
  const reach = [
    [of((f) => f.reach === 'lands'), 'land here'],
    [of((f) => f.reach === 'may land'), 'may land here'],
    [of((f) => f.reach === 'acts'), 'act here'],
  ]
    .filter(([n]) => n)
    .map(([n, what]) => `${n} ${what}`)
    .join(' · ')
  const ran = of((f) => f.runId !== null)
  const results = [
    [of((f) => f.ok === true), 'passed'],
    [of((f) => f.ok === false), 'failed'],
    [of((f) => f.runId !== null && f.ok === null), 'stopped'],
  ]
    .filter(([n]) => n)
    .map(([n, what]) => `${n} ${what}`)
    .join(', ')
  const notRun = props.flows.length - ran
  const runs = ran
    ? `Newest runs: ${results}${notRun ? ` · ${notRun} never run` : ''}`
    : 'None has run yet.'
  return { reach, runs }
})

const where = (b: ManifestBlock, key: string) =>
  key === 'waysIn'
    ? b.from.includes('*')
      ? b.url
        ? `opens ${b.url}`
        : 'from any page'
      : `from ${b.from.join(', ')}`
    : key === 'leadsTo'
      ? `to ${b.to.join(', ')}`
      : ''
</script>

<template>
  <aside class="island flex max-h-full w-[22rem] flex-col overflow-hidden">
    <div class="flex items-start justify-between gap-2 border-b border-(--island-line) p-4">
      <div>
        <p class="text-xs tracking-wide text-(--ink-soft) uppercase">Page</p>
        <h2 class="font-hand text-2xl leading-tight">{{ props.page.checkpoint }}</h2>
        <p
          v-for="url in props.urls"
          :key="url"
          class="font-mono text-xs break-all text-(--color-sketch-600) dark:text-(--color-sketch-300)"
        >
          {{ url }}
        </p>
        <p v-if="props.page.hubs.length" class="mt-1 text-xs text-(--ink-soft)">
          Page Block: {{ props.page.hubs.map((h) => h.exportName).join(', ') }}
        </p>
      </div>
      <UButton
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Close"
        @click="$emit('close')"
      />
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto p-4">
      <a
        v-if="props.image"
        :href="props.image"
        target="_blank"
        rel="noreferrer"
        title="Open full size"
      >
        <img
          :src="props.image"
          :alt="`${props.page.checkpoint} as it last looked`"
          class="w-full rounded border border-(--island-line)"
        />
      </a>
      <section>
        <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <UIcon name="i-lucide-route" class="size-4 text-(--ink-soft)" /> Flows
          <span class="text-xs font-normal text-(--ink-soft)">{{ props.flows.length }}</span>
        </h3>
        <p v-if="!props.flows.length" class="text-xs text-(--ink-soft)">No flow comes here.</p>
        <div v-else class="mb-2 space-y-0.5 text-xs text-(--ink-soft)">
          <p>{{ flowSummary.reach }}</p>
          <p>{{ flowSummary.runs }}</p>
        </div>
        <ul class="space-y-1.5">
          <li v-for="f in sortedFlows" :key="f.name" class="flex items-center gap-1.5 text-sm">
            <ULink
              :to="urlFor('flows.show', { name: f.name })"
              class="min-w-0 truncate font-medium hover:underline"
              :title="f.name"
            >
              {{ f.name }}
            </ULink>
            <span class="shrink-0 text-xs whitespace-nowrap text-(--ink-soft)"
              >{{ f.reach }} here</span
            >
            <span class="flex-1" />
            <ULink v-if="f.runId" :to="urlFor('runs.show', { id: f.runId })">
              <RunStatus :id="f.runId" :ok="f.ok" />
            </ULink>
            <span v-else class="text-xs text-(--ink-soft)">not run</span>
          </li>
        </ul>
      </section>

      <section v-for="s in sections" :key="s.key">
        <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <UIcon :name="s.icon" class="size-4 text-(--ink-soft)" /> {{ s.title }}
          <span class="text-xs font-normal text-(--ink-soft)">{{ props.page[s.key].length }}</span>
        </h3>
        <p v-if="!props.page[s.key].length" class="text-xs text-(--ink-soft)">{{ s.empty }}</p>
        <ul class="space-y-2">
          <li v-for="b in props.page[s.key]" :key="b.id" class="text-sm">
            <div class="flex items-center gap-1.5">
              <UBadge :label="b.kind" :color="kindColor(b.kind)" variant="subtle" size="sm" />
              <span class="font-medium">{{ b.name }}</span>
              <span class="text-xs text-(--ink-soft)">{{ where(b, s.key) }}</span>
            </div>
            <p v-if="b.description" class="mt-0.5 text-xs text-(--ink-soft)">{{ b.description }}</p>
          </li>
        </ul>
      </section>

      <section v-if="props.page.promised.length">
        <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <UIcon name="i-lucide-shield-check" class="size-4 text-(--ink-soft)" /> Promised on
          arrival
        </h3>
        <ul class="space-y-1">
          <li v-for="(p, i) in props.page.promised" :key="i" class="text-xs">
            <span class="text-(--ink-soft)">{{ p.block }}:</span> {{ p.text }}
          </li>
        </ul>
      </section>

      <section>
        <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <UIcon name="i-lucide-eye" class="size-4 text-(--ink-soft)" /> Shows
        </h3>
        <p v-if="!props.page.reads.length" class="text-xs text-(--ink-soft)">
          No Read Block reads this page.
        </p>
        <div v-for="r in props.page.reads" :key="r.id" class="mb-3">
          <p class="mb-1.5 text-xs text-(--ink-soft)">{{ r.name }}</p>
          <div v-for="[ns, fields] in byNamespace(r.fields)" :key="ns" class="mb-2">
            <p class="font-hand text-base leading-tight">{{ ns }}</p>
            <ul class="mt-1 space-y-1">
              <ShapeTree
                v-for="[field, shape] in fields"
                :key="field"
                :name="field"
                :shape="shape"
              />
            </ul>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>
