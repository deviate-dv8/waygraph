<script setup lang="ts">
import { computed } from 'vue'
import { VueFlow, type Edge, type Node, type VueFlowStore } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import StepNode from '~/components/graph/step_node.vue'
import LaneNode from '~/components/graph/lane_node.vue'
import SketchEdge from '~/components/graph/sketch_edge.vue'

export interface PipelineStep {
  name: string
  kind: string
  description: string
  url?: string
  expects: string[]
  status?: 'passed' | 'failed' | 'running' | 'skipped'
  ms?: number | null
  /** The pane it plays in (a flow with panes, a compared run). */
  pane?: string | null
  /** Where the two sides of a compared run differed after it. */
  diffs?: string[]
}

/**
 * A flow's steps left to right, on the canvas: n8n's pipeline, drawn by hand. Clicking a step selects it. A flow with
 * panes is a lane per pane: each step in its pane's lane, in the order the flow plays them.
 */
const props = defineProps<{ steps: PipelineStep[]; selected: number | null }>()
const emit = defineEmits<{ select: [index: number | null] }>()

let flow: VueFlowStore | null = null
/** Fit every step in view once they're measured: on load, and as a run still playing grows a step at a time. */
function fit() {
  void flow?.fitView({ padding: 0.2, duration: 200 })
}
function ready(instance: VueFlowStore) {
  flow = instance
  fit()
}

const GAP_X = 300
const ROW = 4
/** How far down the next row of steps starts: a step's height with its expectations, and room for the arc between rows. */
const rowHeight = computed(
  () => 230 + Math.max(0, ...props.steps.map((s) => s.expects.length + (s.diffs?.length ?? 0))) * 22
)
/** The panes, in the order they first act: a lane each. None for a flow on one page. */
const lanes = computed(() => [...new Set(props.steps.flatMap((s) => (s.pane ? [s.pane] : [])))])
const nodes = computed<Node[]>(() => {
  if (lanes.value.length) {
    // A lane per pane; along it, each step at its place in the flow, so the arrows read in order across the lanes.
    return [
      ...lanes.value.map((pane, lane) => ({
        id: `lane:${pane}`,
        type: 'lane',
        position: { x: -GAP_X + 40, y: lane * rowHeight.value + 40 },
        data: { label: pane },
        selectable: false,
      })),
      ...props.steps.map((s, index) => ({
        id: String(index),
        type: 'step',
        position: {
          x: index * (GAP_X - 40),
          y: Math.max(0, lanes.value.indexOf(s.pane ?? '')) * rowHeight.value,
        },
        data: { ...s, index, selected: props.selected === index },
      })),
    ]
  }
  return props.steps.map((s, index) => ({
    id: String(index),
    type: 'step',
    // Rows of four, read left to right; a gentle zigzag in a row, as a hand-drawn pipeline would sit on paper.
    position: {
      x: (index % ROW) * GAP_X,
      y: Math.floor(index / ROW) * rowHeight.value + (index % 2 ? 30 : 0),
    },
    data: { ...s, index, selected: props.selected === index },
  }))
})
const edges = computed<Edge[]>(() =>
  props.steps.slice(1).map((s, i) => ({
    id: `${i}->${i + 1}`,
    source: String(i),
    target: String(i + 1),
    type: 'sketch',
    data: {
      label: '',
      status:
        s.status === 'failed'
          ? 'failed'
          : props.steps[i]?.status === 'passed' && s.status
            ? 'passed'
            : undefined,
    },
  }))
)
</script>

<template>
  <VueFlow
    :nodes="nodes"
    :edges="edges"
    :nodes-connectable="false"
    :min-zoom="0.2"
    :max-zoom="1.25"
    class="h-full w-full"
    @pane-ready="ready"
    @nodes-initialized="fit"
    @node-click="
      ({ node }) =>
        node.type === 'step' &&
        emit('select', Number(node.id) === props.selected ? null : Number(node.id))
    "
    @pane-click="emit('select', null)"
  >
    <template #node-step="nodeProps">
      <StepNode v-bind="nodeProps" />
    </template>
    <template #node-lane="nodeProps">
      <LaneNode v-bind="nodeProps" />
    </template>
    <template #edge-sketch="edgeProps">
      <SketchEdge v-bind="edgeProps" />
    </template>
    <Background variant="dots" :gap="22" :size="1.3" />
  </VueFlow>
</template>
