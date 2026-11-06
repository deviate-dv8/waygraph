<script setup lang="ts">
import { sketchEllipse, sketchPath, seedOf } from '~/lib/sketch'

/** The wordmark: three hand-drawn stops on a path, then "waygraph" in the canvas's hand; `mark` is the stops alone. */
const props = defineProps<{ mark?: boolean }>()
const stops = [6, 20, 34].map((x, i) => ({
  x,
  paths: sketchEllipse(9, 9, { seed: seedOf(`logo-${i}`), roughness: 0.7, strokeWidth: 1.4 }),
}))
const route = sketchPath('M 9 12 Q 16 4 24 12 T 38 12', {
  seed: seedOf('logo-path'),
  roughness: 0.6,
  strokeWidth: 1.4,
})
</script>

<template>
  <span class="flex items-center gap-2 select-none">
    <svg width="44" height="22" viewBox="0 0 44 22" aria-hidden="true">
      <path
        v-for="(p, i) in route"
        :key="`r${i}`"
        :d="p.d"
        fill="none"
        :stroke-width="p.strokeWidth"
        style="stroke: var(--color-sketch-500)"
      />
      <g v-for="(s, i) in stops" :key="i" :transform="`translate(${s.x - 4.5}, ${7.5})`">
        <path
          v-for="(p, j) in s.paths"
          :key="j"
          :d="p.d"
          fill="none"
          :stroke-width="p.strokeWidth"
          style="stroke: var(--ink)"
        />
      </g>
    </svg>
    <span v-if="!props.mark" class="font-hand text-xl leading-none font-bold text-(--ink)"
      >waygraph</span
    >
  </span>
</template>
