<script setup lang="ts">
import { computed, ref } from 'vue'
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import WorkspaceLayout from '~/layouts/workspace.vue'
import PageNode from '~/components/graph/page_node.vue'
import SketchEdge from '~/components/graph/sketch_edge.vue'
import PagePanel from '~/components/map/page_panel.vue'
import { layoutTree } from '~/lib/layout'
import { SITE, edgeLabel, mapEdges, pageSummary, siteMap } from '~/lib/project_graph'
import { count } from '~/lib/format'
import type { ManifestBlock, ManifestReadBlock } from '#types/project'

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
  flows: { id: string; name: string; file: string; steps: number }[]
  skipped: { file: string; error: string }[]
}>()

const selected = ref<string | null>(null)
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

const nodes = computed<Node[]>(() => {
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
  const placed = layoutTree(roots, childrenOf, { width: 200, height: 84 })
  return [
    ...sites.map((s) => ({
      id: s.id,
      type: 'page',
      position: placed.get(s.id) ?? { x: 0, y: 0 },
      data: { label: s.label, url: s.origin, start: true, actions: 0, expects: 0, reads: 0 },
    })),
    ...props.checkpoints.map((id) => {
      const page = pageSummary(id, props.blocks, props.readBlocks)
      return {
        id,
        type: 'page',
        position: placed.get(id) ?? { x: 0, y: 0 },
        data: {
          label: id,
          url: site.value.paths[id],
          selected: selected.value === id,
          actions: page.actions.length,
          expects: page.expects.length,
          reads: page.reads.length,
        },
      }
    }),
  ]
})

const edges = computed<Edge[]>(() => [
  ...site.value.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'sketch',
    sourceHandle: 'down',
    targetHandle: 'up',
    data: {
      label: edgeLabel(e.blocks),
      dashed: true,
      highlighted: selected.value === e.target,
    },
  })),
  ...edgesData.value.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'sketch',
    sourceHandle: 'out',
    targetHandle: 'in',
    data: {
      label: edgeLabel(e.blocks),
      highlighted: selected.value === e.source || selected.value === e.target,
    },
  })),
])

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
      @pane-ready="({ fitView }) => fitView({ padding: 0.2 })"
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
        @close="selected = null"
      />
    </div>

    <div
      class="island absolute bottom-3 left-3 flex items-center gap-3 px-3 py-2 text-xs text-(--ink-soft)"
    >
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
