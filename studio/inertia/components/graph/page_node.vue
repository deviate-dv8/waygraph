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
    /** How many flows pass through it, and how many of those failed their newest run. */
    flows: number
    failing: number
    /** How many links valid from several pages lead here (a menu, a sidebar): counted, drawn when it's selected. */
    shared?: number
    /** The shells it's under (a menu, a sidebar): what it shares with other pages. */
    layouts?: string[]
    /** What it shows (its Read Blocks' fields), by namespace; a yes/no field is a state the page can be in. */
    shows?: { namespace: string; fields: { name: string; state: boolean }[] }[]
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
      class="flex flex-col items-center py-3 text-center"
      :class="props.data.start ? 'min-w-36 px-9' : 'w-[200px] px-4'"
    >
      <img
        v-if="props.data.image"
        :src="props.data.image"
        :alt="`${props.data.label} as it last looked`"
        class="mb-2 h-24 w-44 rounded border border-(--island-line) object-cover object-top"
        loading="lazy"
      />
      <span class="font-hand text-lg leading-tight break-all text-(--ink)">{{
        props.data.label
      }}</span>
      <span
        v-if="props.data.url && !props.data.start"
        class="mt-0.5 max-w-full truncate font-mono text-[11px] text-(--color-sketch-600) dark:text-(--color-sketch-300)"
        :title="props.data.url"
      >
        {{ props.data.url }}
      </span>
      <span v-if="!props.data.start" class="mt-1 flex gap-2 text-xs text-(--ink-soft)">
        <span v-if="props.data.actions">{{ props.data.actions }} do</span>
        <span v-if="props.data.expects">{{ props.data.expects }} expect</span>
      </span>
      <span
        v-if="props.data.flows"
        class="mt-0.5 flex items-center gap-1 text-xs text-(--ink-soft)"
        :title="`${props.data.flows} flow(s) pass through this page`"
      >
        <UIcon name="i-lucide-route" class="size-3" />
        {{ props.data.flows }} {{ props.data.flows === 1 ? 'flow' : 'flows' }}
        <span v-if="props.data.failing" class="text-(--fail)"
          >· {{ props.data.failing }} failing</span
        >
      </span>
      <span
        v-if="props.data.shared"
        class="mt-0.5 text-[11px] text-(--ink-soft)"
        title="Links valid from several pages lead here; select the page to draw them"
        >{{ props.data.shared }} shared {{ props.data.shared === 1 ? 'link' : 'links' }} in</span
      >
      <span v-if="props.data.layouts?.length" class="mt-1 flex flex-wrap justify-center gap-1">
        <span
          v-for="l in props.data.layouts"
          :key="l"
          class="flex items-center gap-0.5 rounded border border-dashed border-(--island-line) px-1 font-mono text-[10px] leading-4 text-(--ink-soft)"
          :title="`Under the ${l} shell: its links and interrupts are here too`"
        >
          <UIcon name="i-lucide-panels-top-left" class="size-2.5" />{{ l }}
        </span>
      </span>
      <div
        v-if="props.data.shows?.length"
        class="mt-2 w-full space-y-1 border-t border-dashed border-(--island-line) pt-1.5 text-left"
      >
        <div
          v-for="group in props.data.shows"
          :key="group.namespace"
          class="flex flex-wrap items-center gap-1"
        >
          <span class="font-mono text-[10px] text-(--ink-soft)">{{ group.namespace }}</span>
          <span
            v-for="f in group.fields"
            :key="f.name"
            class="rounded border px-1 font-mono text-[10px] leading-4"
            :class="
              f.state
                ? 'border-(--color-sketch-300) bg-(--color-sketch-50) text-(--color-sketch-700) dark:border-(--color-sketch-700) dark:bg-(--color-sketch-950) dark:text-(--color-sketch-200)'
                : 'border-(--island-line) text-(--ink-soft)'
            "
            :title="
              f.state
                ? `${group.namespace}.${f.name}: a state the page can be in (yes / no)`
                : `${group.namespace}.${f.name}`
            "
            >{{ f.name }}</span
          >
        </div>
      </div>
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
