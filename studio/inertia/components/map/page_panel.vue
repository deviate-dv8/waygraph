<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import type { PageSummary } from '~/lib/project_graph'
import { kindColor } from '~/lib/kinds'
import ShapeTree from '~/components/map/shape_tree.vue'
import BlockDetail from '~/components/block_detail.vue'
import RunStatus from '~/components/run_status.vue'
import { urlFor } from '~/client'
import { PREFETCH } from '~/lib/prefetch'
import type { Json, ManifestBlock, PageFlow, SelectorEntry } from '#types/project'

/**
 * The selected page, what matters first: what it is (its addresses, how it last looked), what it shows (the states it
 * can be in first), what you can do there, how you get there and where it leads, what's expected there, its selectors;
 * the flows that pass through it last.
 */
const props = defineProps<{
  page: PageSummary
  urls: string[]
  image?: string | undefined
  /** The flows that pass through it, with how each one's newest run went. */
  flows: PageFlow[]
  /** The shells it's under. */
  layouts?: string[]
  /** The accounts that can open it (its Page Block's `for`); missing: everyone. */
  given?: string[] | undefined
}>()
defineEmits<{ close: [] }>()

/** A Read Block's fields by namespace (`catalog.items`, `catalog.sort` under `catalog`), yes/no fields (states) first. */
const byNamespace = (fields: Record<string, Json>): [string, [string, Json][]][] => {
  const groups = new Map<string, [string, Json][]>()
  for (const [key, shape] of Object.entries(fields)) {
    const dot = key.indexOf('.')
    const [ns, field] = dot > 0 ? [key.slice(0, dot), key.slice(dot + 1)] : ['', key]
    groups.set(ns, [...(groups.get(ns) ?? []), [field, shape]])
  }
  return [...groups].map(([ns, list]) => [
    ns,
    [...list].sort(([, a], [, b]) => Number(b === 'boolean') - Number(a === 'boolean')),
  ])
}
const fieldCount = computed(() =>
  props.page.reads.reduce((n, r) => n + Object.keys(r.fields ?? {}).length, 0)
)

/** The selector entries its Blocks read, each once. */
const selectors = computed(() => {
  const seen = new Map<string, SelectorEntry>()
  for (const b of [
    ...props.page.actions,
    ...props.page.waysIn,
    ...props.page.leadsTo,
    ...props.page.expects,
  ])
    for (const s of b.selectors ?? []) seen.set(s.name, s)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
})

/** The page's own state in its address (`?tab=`), from its Page Block. */
const queryNames = computed(() => [...new Set(props.page.hubs.flatMap((h) => h.query ?? []))])
/** What must be true on arrival, from its Page Block's `verify`: how the page proves it is this page. */
const arrival = computed(() =>
  props.page.hubs.flatMap((h) => {
    const v = h.checks?.verify
    return v && v !== 'dynamic' ? v.map((c) => ({ ...c, block: h.name })) : []
  })
)

const REACH_ORDER: PageFlow['reach'][] = ['lands', 'may land', 'acts']
/** Failing flows first (what needs looking at), then by how they reach the page, then by name. */
const sortedFlows = computed(() =>
  [...props.flows].sort(
    (a, b) =>
      Number(b.ok === false) - Number(a.ok === false) ||
      REACH_ORDER.indexOf(a.reach) - REACH_ORDER.indexOf(b.reach) ||
      a.name.localeCompare(b.name)
  )
)
const tally = computed(() => ({
  passed: props.flows.filter((f) => f.ok === true).length,
  failed: props.flows.filter((f) => f.ok === false).length,
  notRun: props.flows.filter((f) => f.runId === null).length,
}))

type Section = { value: string; label: string; icon: string; count: number }
const sections = computed<Section[]>(() =>
  // In the order of the page object: how it opens, how it proves it's there, what it shows, what you can do, what's expected.
  [
    {
      value: 'waysIn',
      label: 'Opens from',
      icon: 'i-lucide-log-in',
      count: props.page.waysIn.length,
    },
    {
      value: 'arrival',
      label: 'Arrives when',
      icon: 'i-lucide-map-pin-check',
      count: arrival.value.length,
    },
    {
      value: 'shows',
      label: 'Shows (read)',
      icon: 'i-lucide-eye',
      count: fieldCount.value + queryNames.value.length,
    },
    {
      value: 'actions',
      label: 'Do',
      icon: 'i-lucide-mouse-pointer-click',
      count: props.page.actions.length,
    },
    {
      value: 'expects',
      label: 'Expects',
      icon: 'i-lucide-badge-check',
      count: props.page.expects.length + props.page.promised.length,
    },
    {
      value: 'leadsTo',
      label: 'Leads to',
      icon: 'i-lucide-log-out',
      count: props.page.leadsTo.length,
    },
    {
      value: 'selectors',
      label: 'Selectors',
      icon: 'i-lucide-crosshair',
      count: selectors.value.length,
    },
    { value: 'flows', label: 'Flows', icon: 'i-lucide-route', count: props.flows.length },
  ].map((s) => ({ ...s, disabled: s.count === 0 }))
)
const open = ref(['arrival', 'shows', 'actions'])
/** Wide, for reading a Block's code: kept in this browser. */
const wide = useStorage('waygraph-page-panel-wide', false)
const blockLists = ['actions', 'waysIn', 'leadsTo'] as const
type BlockList = (typeof blockLists)[number]
const isBlockList = (value: string): value is BlockList =>
  (blockLists as readonly string[]).includes(value)
const blocksIn = (value: string): ManifestBlock[] => (isBlockList(value) ? props.page[value] : [])
/** The Block opened in a list, to show its checks, selectors and code. */
const openBlock = ref<string | null>(null)
const where = (b: ManifestBlock, list: BlockList) =>
  list === 'waysIn'
    ? b.from.includes('*')
      ? b.url
        ? `opens ${b.url}`
        : 'from any page'
      : `from ${b.from.join(', ')}`
    : list === 'leadsTo'
      ? `to ${b.to.join(', ')}`
      : ''
</script>

<template>
  <aside
    class="island flex max-h-full flex-col overflow-hidden transition-[width] duration-200"
    :class="wide ? 'w-[min(60vw,60rem)]' : 'w-[26rem]'"
  >
    <div class="flex items-start gap-3 border-b border-(--island-line) p-4">
      <a
        v-if="props.image"
        :href="props.image"
        target="_blank"
        rel="noreferrer"
        title="Open full size"
        class="shrink-0"
      >
        <img
          :src="props.image"
          :alt="`${props.page.checkpoint} as it last looked`"
          class="h-16 w-24 rounded border border-(--island-line) object-cover object-top"
        />
      </a>
      <div class="min-w-0 flex-1">
        <h2 class="font-hand text-2xl leading-tight">{{ props.page.checkpoint }}</h2>
        <p
          v-for="url in props.urls"
          :key="url"
          class="truncate font-mono text-xs text-(--color-sketch-600) dark:text-(--color-sketch-300)"
          :title="url"
        >
          {{ url }}
        </p>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <UBadge
            v-if="tally.failed"
            :label="`${tally.failed} failing`"
            icon="i-lucide-circle-x"
            color="error"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="tally.passed"
            :label="`${tally.passed} passing`"
            icon="i-lucide-circle-check"
            color="success"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="tally.notRun"
            :label="`${tally.notRun} not run`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-for="l in props.layouts ?? []"
            :key="`layout-${l}`"
            :label="l"
            icon="i-lucide-panels-top-left"
            color="neutral"
            variant="outline"
            size="sm"
            :title="`Under the ${l} shell`"
          />
          <UBadge
            v-if="props.given"
            :label="`only ${props.given.join(', ')}`"
            icon="i-lucide-lock"
            color="warning"
            variant="subtle"
            size="sm"
            title="Who can open it (its Page Block's for)"
          />
          <UBadge
            v-for="h in props.page.hubs"
            :key="h.id"
            :label="h.exportName"
            icon="i-lucide-file-box"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </div>
      </div>
      <div class="flex shrink-0 items-center">
        <UTooltip :text="wide ? 'Narrower' : 'Wider, to read code'">
          <UButton
            :icon="wide ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            size="xs"
            color="neutral"
            variant="ghost"
            :aria-label="wide ? 'Make the panel narrower' : 'Make the panel wider'"
            @click="wide = !wide"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="Close"
          @click="$emit('close')"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4">
      <UAccordion v-model="open" type="multiple" :items="sections" :unmount-on-hide="true">
        <template #trailing="{ item }">
          <UBadge
            :label="String(item.count)"
            color="neutral"
            variant="subtle"
            size="sm"
            class="ms-auto me-2"
          />
        </template>
        <template #body="{ item }">
          <!-- What the page shows: by namespace, the states it can be in (yes / no) first. -->
          <div v-if="item.value === 'shows'" class="space-y-3">
            <p v-if="queryNames.length" class="flex flex-wrap items-center gap-1 text-xs">
              <span class="text-(--ink-soft)">In the address:</span>
              <UBadge
                v-for="q in queryNames"
                :key="q"
                :label="`?${q}`"
                color="neutral"
                variant="subtle"
                size="sm"
                class="font-mono"
              />
            </p>
            <div v-for="r in props.page.reads" :key="r.id">
              <div v-for="[ns, fields] in byNamespace(r.fields ?? {})" :key="ns" class="mb-2">
                <p class="font-hand text-base leading-tight">
                  {{ ns }} <span class="font-sans text-xs text-(--ink-soft)">· {{ r.name }}</span>
                </p>
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
          </div>

          <ul v-else-if="item.value === 'arrival'" class="space-y-1">
            <li
              v-for="(c, i) in arrival"
              :key="i"
              class="rounded-md border border-(--island-line) px-2 py-1 text-xs"
            >
              {{ c.wants ?? c.name }}
              <code v-if="c.selector" class="text-(--ink-soft)">{{ c.selector }}</code>
            </li>
          </ul>

          <ul v-else-if="isBlockList(item.value)" class="space-y-1">
            <li v-for="b in blocksIn(item.value)" :key="b.id">
              <button
                type="button"
                class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-(--island-line)"
                :aria-expanded="openBlock === `${item.value}:${b.id}`"
                @click="
                  openBlock = openBlock === `${item.value}:${b.id}` ? null : `${item.value}:${b.id}`
                "
              >
                <UBadge :label="b.kind" :color="kindColor(b.kind)" variant="subtle" size="sm" />
                <span class="min-w-0 truncate font-medium" :title="b.name">{{ b.name }}</span>
                <span class="ms-auto shrink-0 truncate text-xs text-(--ink-soft)">{{
                  where(b, item.value as BlockList)
                }}</span>
                <UIcon
                  :name="
                    openBlock === `${item.value}:${b.id}`
                      ? 'i-lucide-chevron-up'
                      : 'i-lucide-chevron-down'
                  "
                  class="size-3.5 shrink-0 text-(--ink-soft)"
                />
              </button>
              <div
                v-if="openBlock === `${item.value}:${b.id}`"
                class="mt-1 mb-2 ml-2 border-l-2 border-(--island-line) pl-3"
              >
                <BlockDetail :block="b" />
              </div>
            </li>
          </ul>

          <div v-else-if="item.value === 'expects'" class="space-y-2">
            <div
              v-for="b in props.page.expects"
              :key="b.id"
              class="flex items-center gap-1.5 text-sm"
            >
              <UBadge :label="b.kind" :color="kindColor(b.kind)" variant="subtle" size="sm" />
              <span class="font-medium">{{ b.name }}</span>
            </div>
            <div v-if="props.page.promised.length">
              <p class="mb-1 text-xs font-medium text-(--ink-soft)">Promised on arrival</p>
              <ul class="space-y-1">
                <li
                  v-for="(p, i) in props.page.promised"
                  :key="i"
                  class="rounded-md border border-(--island-line) px-2 py-1 text-xs"
                >
                  {{ p.text }} <span class="text-(--ink-soft)">· {{ p.block }}</span>
                </li>
              </ul>
            </div>
          </div>

          <ul v-else-if="item.value === 'selectors'" class="space-y-1.5">
            <li
              v-for="s in selectors"
              :key="s.name"
              class="rounded-md border border-(--island-line) px-2 py-1.5"
            >
              <p class="flex items-center justify-between gap-2 text-xs">
                <span class="font-medium">{{ s.name }}</span>
                <span class="font-mono text-[11px] text-(--ink-soft)" :title="s.file"
                  >:{{ s.line }}</span
                >
              </p>
              <code
                class="block font-mono text-[11.5px] break-all"
                :class="s.literal ? 'text-(--code-str)' : 'text-(--ink-soft)'"
                >{{ s.selector }}</code
              >
            </li>
          </ul>

          <ul v-else-if="item.value === 'flows'" class="space-y-1">
            <li v-for="f in sortedFlows" :key="f.name" class="flex items-center gap-1.5 text-sm">
              <ULink
                :to="urlFor('flows.show', { name: f.name })"
                v-bind="PREFETCH"
                class="min-w-0 truncate font-medium hover:underline"
                :title="f.name"
              >
                {{ f.name }}
              </ULink>
              <span class="shrink-0 text-xs whitespace-nowrap text-(--ink-soft)">{{
                f.reach
              }}</span>
              <span class="flex-1" />
              <ULink v-if="f.runId" :to="urlFor('runs.show', { id: f.runId })">
                <RunStatus :id="f.runId" :ok="f.ok" />
              </ULink>
              <span v-else class="text-xs text-(--ink-soft)">not run</span>
            </li>
          </ul>
        </template>
      </UAccordion>
    </div>
  </aside>
</template>
