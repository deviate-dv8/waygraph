<script setup lang="ts">
import { computed, ref } from 'vue'
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import WorkspaceLayout from '~/layouts/workspace.vue'
import PageNode from '~/components/graph/page_node.vue'
import SketchEdge from '~/components/graph/sketch_edge.vue'
import PagePanel from '~/components/map/page_panel.vue'
import { layoutLeftToRight } from '~/lib/layout'
import { ANYWHERE, edgeLabel, mapEdges, pageSummary } from '~/lib/project_graph'
import { count } from '~/lib/format'
import type { ManifestBlock, ManifestReadBlock } from '#types/project'

/** The project's map: every page as a hand-drawn node, every move between pages as an arrow. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  checkpoints: string[]
  blocks: ManifestBlock[]
  readBlocks: ManifestReadBlock[]
  flows: { id: string; name: string; file: string; steps: number }[]
  skipped: { file: string; error: string }[]
}>()

const selected = ref<string | null>(null)
const edgesData = computed(() => mapEdges(props.blocks))

const nodes = computed<Node[]>(() => {
  const ids = [
    ...(edgesData.value.some((e) => e.source === ANYWHERE) ? [ANYWHERE] : []),
    ...props.checkpoints,
  ]
  const placed = layoutLeftToRight(
    ids.map((id) => ({ id, width: 190, height: 74 })),
    edgesData.value
  )
  return ids.map((id) => {
    const page = pageSummary(id, props.blocks, props.readBlocks)
    return {
      id,
      type: 'page',
      position: placed.get(id) ?? { x: 0, y: 0 },
      data: {
        label: id === ANYWHERE ? 'anywhere' : id,
        start: id === ANYWHERE,
        selected: selected.value === id,
        actions: page.actions.length,
        expects: page.expects.length,
        reads: page.reads.length,
      },
    }
  })
})

const edges = computed<Edge[]>(() =>
  edgesData.value.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'sketch',
    data: {
      label: edgeLabel(e.blocks),
      highlighted: selected.value === e.source || selected.value === e.target,
    },
  }))
)

const page = computed(() =>
  selected.value && selected.value !== ANYWHERE
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

    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-start p-3 pt-20">
      <PagePanel v-if="page" class="pointer-events-auto" :page="page" @close="selected = null" />
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
