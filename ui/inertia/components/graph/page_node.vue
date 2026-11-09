<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import SketchBox from '~/components/sketch/sketch_box.vue'

/**
 * A page (Checkpoint) on the map: its name, its address, and how much you can do, expect and read there, as flowchart's
 * process (a rectangle). A site (`start`) is the root its pages hang from: a terminator (round ends) with its host.
 */
const props = defineProps<{
  data: {
    label: string
    /** The page's path on its site, or a site's full origin. */
    url?: string
    /** Its newest screenshot, when a Block took one. */
    image?: string
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
    :shape="props.data.start ? 'stadium' : 'rect'"
    :stroke="props.data.selected ? 'var(--color-sketch-500)' : 'var(--ink)'"
    :fill="
      props.data.selected
        ? 'var(--hatch-selected)'
        : props.data.start
          ? 'var(--hatch-start)'
          : 'transparent'
    "
    :stroke-width="props.data.selected ? 2.2 : 1.4"
    class="cursor-pointer bg-(--paper)"
  >
    <div
      class="flex min-w-36 flex-col items-center py-3 text-center"
      :class="props.data.start ? 'px-9' : 'px-5'"
    >
      <img
        v-if="props.data.image"
        :src="props.data.image"
        :alt="`${props.data.label} as it last looked`"
        class="mb-2 h-24 w-44 rounded border border-(--island-line) object-cover object-top"
        loading="lazy"
      />
      <span class="font-hand text-lg leading-tight text-(--ink)">{{ props.data.label }}</span>
      <span
        v-if="props.data.url && !props.data.start"
        class="mt-0.5 max-w-52 truncate font-mono text-[11px] text-(--color-sketch-600) dark:text-(--color-sketch-300)"
        :title="props.data.url"
      >
        {{ props.data.url }}
      </span>
      <span v-if="!props.data.start" class="mt-1 flex gap-2 text-xs text-(--ink-soft)">
        <span v-if="props.data.actions">{{ props.data.actions }} do</span>
        <span v-if="props.data.expects">{{ props.data.expects }} expect</span>
        <span v-if="props.data.reads">reads</span>
      </span>
    </div>
    <!-- Moves come in on the left and leave on the right; the site map's tree runs top to bottom. -->
    <Handle id="in" type="target" :position="Position.Left" class="opacity-0" />
    <Handle id="out" type="source" :position="Position.Right" class="opacity-0" />
    <Handle id="up" type="target" :position="Position.Top" class="opacity-0" />
    <!-- A move to a page of the same depth comes back in on the side it left from: a bracket beside the boxes. -->
    <Handle id="back" type="target" :position="Position.Right" class="opacity-0" />
    <Handle id="under" type="target" :position="Position.Bottom" class="opacity-0" />
    <Handle id="down" type="source" :position="Position.Bottom" class="opacity-0" />
  </SketchBox>
</template>
