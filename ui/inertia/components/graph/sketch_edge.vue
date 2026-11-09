<script setup lang="ts">
import { computed } from 'vue'
import {
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from '@vue-flow/core'
import { sketchPath, seedOf } from '~/lib/sketch'
import { kindColor } from '~/lib/kinds'

/** A hand-drawn arrow between two pages, labelled with the Blocks that make that move. */
const props = defineProps<
  EdgeProps<{
    /** Plain text on the line (a line with Blocks shows them as badges instead). */
    label?: string
    highlighted?: boolean
    status?: 'passed' | 'failed'
    /** A page's place in its site (the site map), not a move. */
    dashed?: boolean
    /** Drawn in right angles (the map), not curves. */
    squared?: boolean
    /** Which of several squared lines from the same place this is: each bends at its own distance, so none overlap. */
    lane?: number
    /** The Blocks that make this move, each shown whole as a badge in its kind's colour (instead of `label`). */
    blocks?: { name: string; kind: string; description: string }[]
    /** Where the map planned this line's badges: beside its target, before or after it, at an offset in their stack. */
    place?: { side: 'before' | 'after'; offset: number } | undefined
  }>
>()

/**
 * The edge's path and its label's place. A move to the next row of a pipeline runs back along the gap between the
 * rows; a move back to the left in the same row (a return) arcs below the boxes instead of cutting through them.
 */
const geometry = computed<[string, number, number]>(() => {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props
  if (props.data?.squared) {
    const spread = 24 + (props.data.lane ?? 0) * 14
    const across = props.sourcePosition === props.targetPosition
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition: props.sourcePosition,
      targetPosition: props.targetPosition,
      borderRadius: 10,
      // A bracket (out and back in on the same side) stands off by its lane; a line between columns or rows bends at it.
      offset: across ? spread : 24,
      ...(!across && props.sourcePosition === Position.Right ? { centerX: sx + spread } : {}),
      ...(!across && props.sourcePosition === Position.Bottom ? { centerY: sy + spread } : {}),
    })
    // A line into the next column (or row) carries its label at its end, just before its arrowhead: in the gap before its
    // target, not over a box its middle might pass.
    if (!across && props.sourcePosition === Position.Right) return [path, tx - 16, ty]
    if (!across && props.sourcePosition === Position.Bottom) return [path, tx, ty - 16]
    return [path, labelX, labelY]
  }
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

/**
 * Where the badges go, when the map planned it: beside the target at the planned side, in the planned place of the stack
 * of labels there. Left to right, before is left of the page (ending at the arrowhead), after is right of it; top down,
 * before is above (the stack growing up), after is below (growing down). The map left room there, so they cover nothing.
 */
const planned = computed(() => {
  const place = props.data?.place
  if (!place) return null
  const { targetX: tx, targetY: ty } = props
  const lr = props.sourcePosition === Position.Right
  if (lr) {
    return place.side === 'before'
      ? { x: tx - 16, y: ty + place.offset, shift: 'translate(-100%, -50%)', align: 'items-end' }
      : { x: tx + 16, y: ty + place.offset, shift: 'translate(0, -50%)', align: 'items-start' }
  }
  return place.side === 'before'
    ? { x: tx, y: ty - 16 - place.offset, shift: 'translate(-50%, -100%)', align: 'items-center' }
    : { x: tx, y: ty + 16 + place.offset, shift: 'translate(-50%, 0)', align: 'items-center' }
})

/**
 * How a label sits on its point: a line into the next column ends its labels at the arrowhead (right-aligned, left of
 * the point), into the next row above it; any other line centres them on its middle.
 */
const anchor = computed(() => {
  const straight = props.data?.squared && props.sourcePosition !== props.targetPosition
  if (straight && props.sourcePosition === Position.Right)
    return { shift: 'translate(-100%, -50%)', align: 'items-end' }
  if (straight && props.sourcePosition === Position.Bottom)
    return { shift: 'translate(-50%, -100%)', align: 'items-center' }
  return { shift: 'translate(-50%, -50%)', align: 'items-center' }
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
    strokeWidth: props.data?.highlighted ? 2.6 : 1.8,
    bowing: 2,
    // A dashed line is one stroke: rough's second pass would fill the gaps.
    ...(props.data?.dashed ? { disableMultiStroke: true } : {}),
  })
)

/** Which way the line runs into its target: an arrowhead points that way. */
const INTO: Record<Position, [number, number]> = {
  [Position.Left]: [1, 0],
  [Position.Right]: [-1, 0],
  [Position.Top]: [0, 1],
  [Position.Bottom]: [0, -1],
}

/** Two short strokes at the target, pointing the way the line comes in: a hand-drawn arrowhead. */
const head = computed(() => {
  const x = props.targetX
  const y = props.targetY
  const [dx, dy] = INTO[props.targetPosition] ?? [1, 0]
  // Back along the line 11, out to either side 6.
  const bx = x - dx * 11
  const by = y - dy * 11
  const d = `M ${bx - dy * 6} ${by + dx * 6} L ${x} ${y} L ${bx + dy * 6} ${by - dx * 6}`
  return sketchPath(d, {
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
      v-if="props.data?.blocks?.length"
      class="nodrag nopan absolute flex flex-col gap-0.5"
      :class="planned?.align ?? anchor.align"
      :style="{
        transform: planned
          ? `translate(${planned.x}px, ${planned.y}px) ${planned.shift}`
          : `${anchor.shift} translate(${geometry[1]}px, ${geometry[2]}px)`,
      }"
    >
      <UBadge
        v-for="b in props.data.blocks"
        :key="b.name"
        :label="b.name"
        :color="kindColor(b.kind)"
        variant="subtle"
        size="sm"
        class="bg-(--paper) font-mono whitespace-nowrap"
        :title="`${b.kind}${b.description ? ': ' + b.description : ''}`"
      />
    </div>
    <div
      v-else-if="props.data?.label"
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
