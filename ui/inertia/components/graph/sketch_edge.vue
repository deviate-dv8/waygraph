<script setup lang="ts">
import { computed } from 'vue'
import { EdgeLabelRenderer, getBezierPath, Position, type EdgeProps } from '@vue-flow/core'
import { sketchPath, seedOf } from '~/lib/sketch'

/** A hand-drawn arrow between two pages, labelled with the Blocks that make that move. */
const props = defineProps<
  EdgeProps<{
    label: string
    highlighted?: boolean
    status?: 'passed' | 'failed'
    /** A page's place in its site (the site map), not a move. */
    dashed?: boolean
  }>
>()

/**
 * The edge's path and its label's place. A move to the next row of a pipeline runs back along the gap between the
 * rows; a move back to the left in the same row (a return) arcs below the boxes instead of cutting through them.
 */
const geometry = computed<[string, number, number]>(() => {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props
  // Only a move left to right gets routed around boxes; a tree edge (top to bottom) curves straight in.
  const sideways = props.sourcePosition === Position.Right && props.targetPosition === Position.Left
  if (sideways && tx < sx - 20 && ty > sy + 120) {
    const gapY = (sy + ty) / 2
    const midX = (sx + tx) / 2
    return [
      `M ${sx} ${sy} C ${sx + 50} ${sy}, ${sx + 50} ${gapY}, ${sx} ${gapY} L ${tx} ${gapY} C ${tx - 50} ${gapY}, ${tx - 50} ${ty}, ${tx} ${ty}`,
      midX,
      gapY,
    ]
  }
  if (sideways && tx < sx - 20) {
    const drop = Math.max(sy, ty) + 90
    const midX = (sx + tx) / 2
    return [
      `M ${sx} ${sy} C ${sx + 110} ${sy}, ${sx + 60} ${drop}, ${midX} ${drop} S ${tx - 110} ${ty}, ${tx} ${ty}`,
      midX,
      drop,
    ]
  }
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  })
  return [path, labelX, labelY]
})

const color = computed(() =>
  props.data?.status === 'failed'
    ? 'var(--fail)'
    : props.data?.status === 'passed'
      ? 'var(--pass)'
      : props.data?.highlighted
        ? 'var(--color-sketch-500)'
        : 'var(--ink-soft)'
)

const line = computed(() =>
  sketchPath(geometry.value[0], {
    seed: seedOf(props.id),
    roughness: 1.2,
    strokeWidth: props.data?.highlighted ? 2 : 1.2,
    bowing: 2,
    // A dashed line is one stroke: rough's second pass would fill the gaps.
    ...(props.data?.dashed ? { disableMultiStroke: true } : {}),
  })
)

/** Two short strokes at the target: a hand-drawn arrowhead. */
const head = computed(() => {
  const x = props.targetX
  const y = props.targetY
  return sketchPath(`M ${x - 11} ${y - 6} L ${x} ${y} L ${x - 11} ${y + 6}`, {
    seed: seedOf(props.id) + 1,
    roughness: 0.8,
    strokeWidth: 1.4,
  })
})
</script>

<template>
  <g>
    <path
      v-for="(p, i) in line"
      :key="'l' + i"
      :d="p.d"
      fill="none"
      stroke-linecap="round"
      :stroke-width="p.strokeWidth"
      :stroke-dasharray="props.data?.dashed ? '7 6' : undefined"
      :style="{ stroke: color }"
    />
    <path
      v-for="(p, i) in head"
      :key="'h' + i"
      :d="p.d"
      fill="none"
      stroke-linecap="round"
      :stroke-width="p.strokeWidth"
      :style="{ stroke: color }"
    />
    <!-- A wide invisible stroke: easy to hover and click. -->
    <path :d="geometry[0]" fill="none" stroke="transparent" stroke-width="16" />
  </g>
  <EdgeLabelRenderer>
    <div
      v-if="props.data?.label"
      class="nodrag nopan font-hand absolute max-w-48 truncate rounded px-1 text-xs"
      :style="{
        transform: `translate(-50%, -50%) translate(${geometry[1]}px, ${geometry[2]}px)`,
        color,
        background: 'var(--paper)',
      }"
      :title="props.data?.label"
    >
      {{ props.data?.label }}
    </div>
  </EdgeLabelRenderer>
</template>
