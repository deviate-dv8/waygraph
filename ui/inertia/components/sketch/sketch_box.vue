<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import {
  FILL,
  OUTLINE,
  sketchEllipse,
  sketchParallelogram,
  sketchRect,
  sketchStadium,
  sketchSubroutine,
  seedOf,
} from '~/lib/sketch'

/**
 * A hand-drawn outline behind its content, sized to it: the box every node and card on the canvas is drawn with, in
 * flowchart's shapes (`stadium` a terminator, `rect` a process, `subroutine` a predefined process, `parallelogram` input
 * / output). The same `seed` (by default the label) draws the same wobble every time.
 */
const props = withDefaults(
  defineProps<{
    seed: string
    shape?: 'rect' | 'ellipse' | 'stadium' | 'parallelogram' | 'subroutine'
    stroke?: string
    fill?: string
    fillStyle?: 'hachure' | 'solid' | 'cross-hatch' | 'zigzag'
    strokeWidth?: number
    roughness?: number
  }>(),
  {
    shape: 'rect',
    stroke: 'var(--ink)',
    fill: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 1.4,
    roughness: 1.1,
  }
)

const box = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
let observer: ResizeObserver | undefined

onMounted(() => {
  if (!box.value) return
  observer = new ResizeObserver(([entry]) => {
    if (entry) size.value = { w: entry.contentRect.width, h: entry.contentRect.height }
  })
  observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())

const drawn = computed(() => {
  const { w, h } = size.value
  if (!w || !h) return []
  const options = {
    seed: seedOf(props.seed),
    stroke: OUTLINE,
    strokeWidth: props.strokeWidth,
    roughness: props.roughness,
    bowing: 1,
    ...(props.fill === 'transparent' ? {} : { fill: FILL }),
    fillStyle: props.fillStyle,
    fillWeight: 0.6,
    hachureGap: 6,
  }
  const draw = {
    rect: sketchRect,
    ellipse: sketchEllipse,
    stadium: sketchStadium,
    parallelogram: sketchParallelogram,
    subroutine: sketchSubroutine,
  }[props.shape]
  return draw(w, h, options)
})
</script>

<template>
  <div ref="box" class="relative">
    <svg
      class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden="true"
    >
      <path
        v-for="(p, i) in drawn"
        :key="i"
        :d="p.d"
        :stroke-width="p.strokeWidth"
        stroke-linecap="round"
        :style="
          p.part === 'outline'
            ? { stroke, fill: 'none' }
            : p.part === 'hachure'
              ? { stroke: fill, fill: 'none' }
              : { stroke: 'none', fill }
        "
      />
    </svg>
    <div class="relative">
      <slot />
    </div>
  </div>
</template>
