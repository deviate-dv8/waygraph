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
    /** Where the step goes (a Nav's url) or, on a run, the address it ended on. */
    url?: string
    expects: string[]
    status?: 'passed' | 'failed' | 'running' | 'skipped'
    ms?: number | null
    selected?: boolean
  }
}>()

/**
 * The step in flowchart's shapes: going to a page (a Nav or Page step) is a terminator, an API call input / output, a
 * fast-forward (several Blocks as one) a predefined process, any other step a process.
 */
const shape = (): 'stadium' | 'parallelogram' | 'subroutine' | 'rect' => {
  const { kind, name } = props.data
  if (kind === 'nav' || kind === 'page') return 'stadium'
  if (kind === 'api') return 'parallelogram'
  if (/^ff-\d+$/.test(name) || kind === 'block') return 'subroutine'
  return 'rect'
}

/** Room for the shape's own edges: round ends, slanted sides, side bars. */
const padding = (): string =>
  ({ stadium: 'px-7', parallelogram: 'px-8', subroutine: 'px-7', rect: 'px-4' })[shape()]

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
    :shape="shape()"
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
    <div class="w-56 py-3" :class="padding()">
      <div class="flex items-center justify-between gap-2 text-xs text-(--ink-soft)">
        <span>step {{ props.data.index + 1 }} · {{ props.data.kind }}</span>
        <span v-if="props.data.ms != null">{{ props.data.ms }} ms</span>
      </div>
      <p class="font-hand mt-0.5 text-lg leading-tight break-words">
        {{ /^ff-\d+$/.test(props.data.name) ? 'fast-forward' : props.data.name }}
      </p>
      <p
        v-if="props.data.url"
        class="mt-0.5 truncate font-mono text-[11px] text-(--color-sketch-600) dark:text-(--color-sketch-300)"
        :title="props.data.url"
      >
        {{ props.data.url }}
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
