<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import SketchBox from '~/components/sketch/sketch_box.vue'

/**
 * A layout on the map: the UI many pages share (a menu, a sidebar), as flowchart's predefined process (a subroutine
 * box), once, with a line to each page its links lead to. The pages it covers carry its mark.
 */
const props = defineProps<{
  data: { label: string; links: number; covers: number; selected?: boolean }
}>()
</script>

<template>
  <SketchBox
    :seed="props.data.label"
    shape="subroutine"
    :stroke="props.data.selected ? 'var(--color-sketch-500)' : 'var(--ink)'"
    :fill="props.data.selected ? 'var(--hatch-selected)' : 'transparent'"
    :stroke-width="props.data.selected ? 2.2 : 1.4"
    class="cursor-pointer bg-(--paper)"
  >
    <div class="flex min-w-40 flex-col items-center px-8 py-3 text-center">
      <span class="flex items-center gap-1 font-hand text-lg leading-tight text-(--ink)">
        <UIcon name="i-lucide-panels-top-left" class="size-4" />{{ props.data.label }}
      </span>
      <span class="mt-1 text-xs text-(--ink-soft)">
        {{ props.data.links }} {{ props.data.links === 1 ? 'link' : 'links' }} ·
        {{ props.data.covers }} {{ props.data.covers === 1 ? 'page' : 'pages' }}
      </span>
    </div>
    <Handle id="in" type="target" :position="Position.Left" class="opacity-0" />
    <Handle id="out" type="source" :position="Position.Right" class="opacity-0" />
    <Handle id="up" type="target" :position="Position.Top" class="opacity-0" />
    <Handle id="down" type="source" :position="Position.Bottom" class="opacity-0" />
  </SketchBox>
</template>
