<script setup lang="ts">
import { computed, ref } from 'vue'
import MapTreeRow from '~/components/map/map_tree_row.vue'
import { checkState, subtree, type MapTree } from '~/lib/map_filter'

/** What a row in the map's tree shows: a site, a folder of its paths, or a page with its address. */
export type TreeLabel = { kind: 'site' | 'folder' | 'page'; label: string; sub?: string }

/** One node of the map's tree with a box to show or hide it (and what's under it), and its children below. */
const props = defineProps<{
  id: string
  tree: MapTree
  hidden: ReadonlySet<string>
  labels: Record<string, TreeLabel>
  depth: number
  /** Only rows whose subtree has a match are drawn; empty: every row. */
  query: string
  selected: string | null
}>()
const emit = defineEmits<{ toggle: [id: string]; only: [id: string]; select: [id: string] }>()

const ICON = { site: 'i-lucide-globe', folder: 'i-lucide-folder', page: 'i-lucide-file' } as const
const label = computed(() => props.labels[props.id] ?? { kind: 'page' as const, label: props.id })
const children = computed(() => props.tree.childrenOf.get(props.id) ?? [])
const state = computed(() => checkState(props.tree, props.hidden, props.id))
// Sites and the first folders start open; deeper levels start closed.
const open = ref(props.depth < 2)
const text = (id: string) =>
  `${props.labels[id]?.label ?? id} ${props.labels[id]?.sub ?? ''}`.toLowerCase()
const matches = computed(
  () => !props.query || subtree(props.tree, props.id).some((n) => text(n).includes(props.query))
)
</script>

<template>
  <li v-if="matches">
    <div
      class="group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-(--island-line)"
      :class="
        props.selected === props.id ? 'bg-(--color-sketch-100) dark:bg-(--color-sketch-900)' : ''
      "
      :style="{ paddingLeft: `${props.depth * 12 + 4}px` }"
    >
      <button
        v-if="children.length"
        type="button"
        class="text-(--ink-soft)"
        :aria-label="open || props.query ? 'Collapse' : 'Expand'"
        @click="open = !open"
      >
        <UIcon
          :name="open || props.query ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-3.5"
        />
      </button>
      <span v-else class="w-3.5" />
      <UCheckbox
        :model-value="state"
        size="xs"
        :aria-label="`Show ${label.label}`"
        @update:model-value="emit('toggle', props.id)"
      />
      <UIcon :name="ICON[label.kind]" class="size-3.5 shrink-0 text-(--ink-soft)" />
      <button
        type="button"
        class="min-w-0 truncate text-left"
        :class="label.kind === 'page' ? 'font-medium' : 'font-mono text-(--ink-soft)'"
        :title="label.sub ?? label.label"
        @click="label.kind === 'page' ? emit('select', props.id) : (open = !open)"
      >
        {{ label.label }}
        <span
          v-if="label.sub && label.kind === 'page'"
          class="font-mono font-normal text-(--ink-soft)"
          >{{ label.sub }}</span
        >
      </button>
      <span class="flex-1" />
      <button
        type="button"
        class="hidden text-[11px] text-(--ink-soft) group-hover:inline hover:text-(--ink)"
        @click="emit('only', props.id)"
      >
        only
      </button>
    </div>
    <ul v-if="children.length && (open || props.query)">
      <MapTreeRow
        v-for="child in children"
        :id="child"
        :key="child"
        :tree="props.tree"
        :hidden="props.hidden"
        :labels="props.labels"
        :depth="props.depth + 1"
        :query="props.query"
        :selected="props.selected"
        @toggle="emit('toggle', $event)"
        @only="emit('only', $event)"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>
