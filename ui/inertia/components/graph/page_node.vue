<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import SketchBox from '~/components/sketch/sketch_box.vue'

/** A page (Checkpoint) on the map: its name, and how much you can do, expect and read there. */
const props = defineProps<{
  data: {
    label: string
    start?: boolean
    selected?: boolean
    actions: number
    expects: number
    reads: number
  }
}>()
</script>

<template>
  <SketchBox
    :seed="props.data.label"
    :shape="props.data.start ? 'ellipse' : 'rect'"
    :stroke="props.data.selected ? 'var(--color-sketch-500)' : 'var(--ink)'"
    :fill="
      props.data.selected
        ? 'var(--hatch-selected)'
        : props.data.start
          ? 'var(--hatch-start)'
          : 'transparent'
    "
    :stroke-width="props.data.selected ? 2.2 : 1.4"
    class="cursor-pointer"
  >
    <div class="flex min-w-36 flex-col items-center px-5 py-3 text-center">
      <span class="font-hand text-lg leading-tight text-(--ink)">{{ props.data.label }}</span>
      <span v-if="!props.data.start" class="mt-1 flex gap-2 text-xs text-(--ink-soft)">
        <span v-if="props.data.actions">{{ props.data.actions }} do</span>
        <span v-if="props.data.expects">{{ props.data.expects }} expect</span>
        <span v-if="props.data.reads">reads</span>
      </span>
    </div>
    <Handle type="target" :position="Position.Left" class="opacity-0" />
    <Handle type="source" :position="Position.Right" class="opacity-0" />
  </SketchBox>
</template>
