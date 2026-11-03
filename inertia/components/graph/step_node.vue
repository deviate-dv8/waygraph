<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import SketchBox from '~/components/sketch/sketch_box.vue'

/** One step of a flow (or a run): its Block, what it expects after it, and - on a run - how it went. */
const props = defineProps<{
  data: {
    index: number
    name: string
    kind: string
    description: string
    expects: string[]
    status?: 'passed' | 'failed' | 'running' | 'skipped'
    ms?: number | null
    selected?: boolean
  }
}>()

const stroke = () =>
  props.data.status === 'failed'
    ? 'var(--fail)'
    : props.data.status === 'passed'
      ? 'var(--pass)'
      : props.data.selected
        ? 'var(--color-sketch-500)'
        : 'var(--ink)'
</script>

<template>
  <SketchBox
    :seed="`${props.data.index}-${props.data.name}`"
    :stroke="stroke()"
    :fill="
      props.data.selected
        ? 'var(--hatch-selected)'
        : props.data.status === 'failed'
          ? 'color-mix(in srgb, var(--fail) 12%, transparent)'
          : 'transparent'
    "
    :stroke-width="props.data.selected || props.data.status === 'failed' ? 2.2 : 1.4"
    class="cursor-pointer"
  >
    <div class="w-56 px-4 py-3">
      <div class="flex items-center justify-between gap-2 text-xs text-(--ink-soft)">
        <span>step {{ props.data.index + 1 }} · {{ props.data.kind }}</span>
        <span v-if="props.data.ms != null">{{ props.data.ms }} ms</span>
      </div>
      <p class="font-hand mt-0.5 text-lg leading-tight break-words">
        {{ /^ff-\d+$/.test(props.data.name) ? 'fast-forward' : props.data.name }}
      </p>
      <p v-if="props.data.description" class="mt-1 line-clamp-2 text-xs text-(--ink-soft)">
        {{ props.data.description }}
      </p>
      <ul
        v-if="props.data.expects.length"
        class="mt-2 space-y-0.5 border-t border-dashed border-(--island-line) pt-2"
      >
        <li v-for="(e, i) in props.data.expects" :key="i" class="flex gap-1 text-xs">
          <span class="text-(--color-sketch-500)">expects</span>
          <span class="line-clamp-2">{{ e }}</span>
        </li>
      </ul>
    </div>
    <Handle type="target" :position="Position.Left" class="opacity-0" />
    <Handle type="source" :position="Position.Right" class="opacity-0" />
  </SketchBox>
</template>
