<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { VueFlow, type Edge, type Node, type VueFlowStore } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import WorkspaceLayout from '~/layouts/workspace.vue'
import PageNode from '~/components/graph/page_node.vue'
import SketchEdge from '~/components/graph/sketch_edge.vue'
import PagePanel from '~/components/map/page_panel.vue'
import { useStorage } from '@vueuse/core'
import { layoutTree, type TreeDirection } from '~/lib/layout'
import { SITE, mapEdges, pageSummary, siteMap } from '~/lib/project_graph'
import { count } from '~/lib/format'
import { MOVE_KINDS, kindColor } from '~/lib/kinds'
import { urlFor } from '~/client'
import type { ManifestBlock, ManifestReadBlock, PageFlow } from '#types/project'

/**
 * The project's map, as a site map: each site at the root, its pages hung from it by their addresses (dashed), and every
 * move between pages as an arrow.
 */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string; baseUrl?: string }
  checkpoints: string[]
  blocks: ManifestBlock[]
  readBlocks: ManifestReadBlock[]
  pageUrls: Record<string, string[]>
  /** The pages in the order the project's flows reach them. */
  journey: string[]
  /** Each page's flows: those with a step that lands, may land or starts on it, and how each one's newest run went. */
  pageFlows: Record<string, PageFlow[]>
  /** Each page's newest screenshot (a Block's `screenshot: true`), by Checkpoint: when it was taken. */
  shots: Record<string, number>
  flows: { id: string; name: string; file: string; steps: number }[]
  skipped: { file: string; error: string }[]
}>()

const selected = ref<string | null>(null)
/** Which way the site map grows: left to right by default; the viewer's pick is remembered in this browser. */
const direction = useStorage<TreeDirection>('waygraph-map-direction', 'LR')
const edgesData = computed(() => mapEdges(props.blocks))
const site = computed(() =>
  siteMap(props.checkpoints, props.pageUrls, props.project.baseUrl, props.blocks)
)

/**
 * The pages in the order a visit meets them: as the project's flows reach them, then along the moves from there, then the
 * rest by address. Rows laid out in this order read like the journey through the site.
 */
const journey = computed(() => {
  const next = new Map<string, string[]>()
  for (const e of edgesData.value) next.set(e.source, [...(next.get(e.source) ?? []), e.target])
  const byAddress = [...props.checkpoints].sort(
    (a, b) =>
      (site.value.paths[a] ?? '~').length - (site.value.paths[b] ?? '~').length ||
      (site.value.paths[a] ?? '~').localeCompare(site.value.paths[b] ?? '~')
  )
  const order: string[] = []
  const visit = (id: string) => {
    if (order.includes(id) || !props.checkpoints.includes(id)) return
    order.push(id)
    for (const to of next.get(id) ?? []) visit(to)
  }
  for (const id of [...props.journey, ...byAddress]) visit(id)
  return order
})

/** Where every node sits: the site map's tree, laid out in the chosen direction. */
const placed = computed(() => {
  const sites = site.value.sites
  // The site map's tree: a page under the page (or site) its address hangs from; a page with no known address under the
  // page whose move first reaches it, else under the first site. Children in journey order.
  const parentOf = new Map<string, string>(site.value.edges.map((e) => [e.target, e.source]))
  for (const id of journey.value) {
    if (parentOf.has(id)) continue
    const from = edgesData.value.find((e) => e.target === id && e.source !== id)?.source
    const parent = from ?? sites[0]?.id
    if (parent) parentOf.set(id, parent)
  }
  const childrenOf = new Map<string, string[]>()
  for (const id of journey.value) {
    const parent = parentOf.get(id)
    if (parent) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), id])
  }
  const roots = [...sites.map((s) => s.id), ...journey.value.filter((id) => !parentOf.has(id))]
  // Pages with a screenshot are taller: every box in a row gets the same height.
  const hasShots = Object.keys(props.shots).length > 0
  return layoutTree(roots, childrenOf, { width: 200, height: hasShots ? 190 : 84 }, direction.value)
})

const nodes = computed<Node[]>(() => {
  const sites = site.value.sites
  return [
    ...sites.map((s) => ({
      id: s.id,
      type: 'page',
      position: placed.value.get(s.id) ?? { x: 0, y: 0 },
      data: {
        label: s.label,
        url: s.origin,
        start: true,
        actions: 0,
        expects: 0,
        reads: 0,
        flows: 0,
        failing: 0,
      },
    })),
    ...props.checkpoints.map((id) => {
      const page = pageSummary(id, props.blocks, props.readBlocks)
      return {
        id,
        type: 'page',
        position: placed.value.get(id) ?? { x: 0, y: 0 },
        data: {
          label: id,
          url: site.value.paths[id],
          image: shotUrl(id),
          selected: selected.value === id,
          actions: page.actions.length,
          expects: page.expects.length,
          reads: page.reads.length,
          flows: props.pageFlows[id]?.length ?? 0,
          failing: props.pageFlows[id]?.filter((f) => f.ok === false).length ?? 0,
        },
      }
    }),
  ]
})

/** Each edge's lane: its place among the edges that leave the same node the same way, so their lines run apart. */
function lanes<E extends { source: string }>(edges: E[]): number[] {
  const seen = new Map<string, number>()
  return edges.map((e) => {
    const n = seen.get(e.source) ?? 0
    seen.set(e.source, n + 1)
    return n
  })
}

let flow: VueFlowStore | null = null
/** Fit the whole map in view once its nodes are measured (and again when the layout changes). */
function fit() {
  void flow?.fitView({ padding: 0.15, duration: 200 })
}
function ready(instance: VueFlowStore) {
  flow = instance
  fit()
}
watch(direction, async () => {
  await nextTick()
  fit()
})

const edges = computed<Edge[]>(() => {
  const siteLanes = lanes(site.value.edges)
  const moveLanes = lanes(edgesData.value)
  return [
    ...site.value.edges.map((e, i) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'sketch',
      // Along the tree: rightwards (left to right) or downwards (top down).
      sourceHandle: direction.value === 'LR' ? 'out' : 'down',
      targetHandle: direction.value === 'LR' ? 'in' : 'up',
      data: {
        blocks: e.blocks.map((b) => ({ name: b.name, kind: b.kind, description: b.description })),
        dashed: true,
        squared: true,
        lane: siteLanes[i],
        highlighted: selected.value === e.target,
      },
    })),
    ...edgesData.value.map((e, i) => {
      // A move deeper into the tree runs along it; one to a page of the same depth (or back up) brackets out to the side
      // and back, past the boxes instead of through them.
      const from = placed.value.get(e.source)
      const to = placed.value.get(e.target)
      const lr = direction.value === 'LR'
      const deeper = !!from && !!to && (lr ? to.x > from.x + 40 : to.y > from.y + 40)
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'sketch',
        sourceHandle: lr ? 'out' : 'down',
        targetHandle: deeper ? (lr ? 'in' : 'up') : lr ? 'back' : 'under',
        data: {
          blocks: e.blocks.map((b) => ({ name: b.name, kind: b.kind, description: b.description })),
          squared: true,
          lane: moveLanes[i],
          highlighted: selected.value === e.source || selected.value === e.target,
        },
      }
    }),
  ]
})

/** A page's newest screenshot, versioned by when it was taken so a new one shows without a stale cache. */
const shotUrl = (checkpoint: string): string | undefined =>
  props.shots[checkpoint]
    ? `${urlFor('screenshots.page', { checkpoint })}?v=${Math.round(props.shots[checkpoint])}`
    : undefined

const page = computed(() =>
  selected.value && !selected.value.startsWith(SITE)
    ? pageSummary(selected.value, props.blocks, props.readBlocks)
    : null
)
</script>

<template>
  <WorkspaceLayout :project="props.project">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="true"
      :nodes-connectable="false"
      :min-zoom="0.2"
      class="h-full w-full"
      @pane-ready="ready"
      @nodes-initialized="fit"
      @node-click="({ node }) => (selected = node.id === selected ? null : node.id)"
      @pane-click="selected = null"
    >
      <template #node-page="nodeProps">
        <PageNode v-bind="nodeProps" />
      </template>
      <template #edge-sketch="edgeProps">
        <SketchEdge v-bind="edgeProps" />
      </template>
      <Background variant="dots" :gap="22" :size="1.3" />
    </VueFlow>

    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-start p-3 pt-16">
      <PagePanel
        v-if="page"
        class="pointer-events-auto"
        :page="page"
        :urls="props.pageUrls[page.checkpoint] ?? []"
        :image="shotUrl(page.checkpoint)"
        :flows="props.pageFlows[page.checkpoint] ?? []"
        @close="selected = null"
      />
    </div>

    <div
      class="island absolute bottom-3 left-3 flex items-center gap-3 px-3 py-2 text-xs text-(--ink-soft)"
    >
      <UTooltip :text="direction === 'LR' ? 'Lay out top down' : 'Lay out left to right'">
        <UButton
          :icon="
            direction === 'LR' ? 'i-lucide-arrow-right-from-line' : 'i-lucide-arrow-down-from-line'
          "
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="direction === 'LR' ? 'Lay out top down' : 'Lay out left to right'"
          @click="direction = direction === 'LR' ? 'TB' : 'LR'"
        />
      </UTooltip>
      <span class="flex items-center gap-1" aria-label="Block kinds">
        <UBadge
          v-for="k in MOVE_KINDS"
          :key="k"
          :label="k"
          :color="kindColor(k)"
          variant="subtle"
          size="sm"
          class="font-mono"
        />
      </span>
      <span>{{ count(props.checkpoints.length, 'page') }}</span>
      <span>{{ count(props.blocks.length, 'Block') }}</span>
      <span>{{ count(props.flows.length, 'flow') }}</span>
      <span>waygraph {{ props.project.waygraph }}</span>
      <UPopover v-if="props.skipped.length">
        <UButton
          size="xs"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :label="`${props.skipped.length} files skipped`"
        />
        <template #content>
          <ul class="max-w-md space-y-1 p-3 text-xs">
            <li v-for="s in props.skipped" :key="s.file">
              <span class="font-mono">{{ s.file }}</span
              >: {{ s.error }}
            </li>
          </ul>
        </template>
      </UPopover>
    </div>
  </WorkspaceLayout>
</template>
