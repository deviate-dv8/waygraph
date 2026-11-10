<script setup lang="ts">
import { computed, ref } from 'vue'
import MapTreeRow, { type TreeLabel } from '~/components/map/map_tree_row.vue'
import type { MapTree } from '~/lib/map_filter'

/**
 * The site map as a folder tree beside the map: check what to see (a site, a folder of its paths, a page). Unchecked
 * parts leave the map; `only` keeps one branch.
 */
const props = defineProps<{
  tree: MapTree
  hidden: ReadonlySet<string>
  labels: Record<string, TreeLabel>
  selected: string | null
}>()
const emit = defineEmits<{
  toggle: [id: string]
  only: [id: string]
  all: []
  none: []
  select: [id: string]
  minimize: []
}>()

const query = ref('')
const q = computed(() => query.value.trim().toLowerCase())
const pages = computed(() => Object.entries(props.labels).filter(([, l]) => l.kind === 'page'))
const shown = computed(() => pages.value.filter(([id]) => !props.hidden.has(id)).length)
</script>

<template>
  <aside class="island flex max-h-full w-72 flex-col overflow-hidden">
    <div class="space-y-2 border-b border-(--island-line) p-3">
      <div class="flex items-center gap-2">
        <p class="text-sm font-semibold">Pages</p>
        <span class="text-xs text-(--ink-soft)">{{ shown }} of {{ pages.length }} shown</span>
        <span class="flex-1" />
        <UButton label="All" size="xs" color="neutral" variant="ghost" @click="emit('all')" />
        <UButton label="None" size="xs" color="neutral" variant="ghost" @click="emit('none')" />
        <UTooltip text="Minimize">
          <UButton
            icon="i-lucide-panel-left-close"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Minimize the pages"
            @click="emit('minimize')"
          />
        </UTooltip>
      </div>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        size="xs"
        placeholder="Find a page or path"
        class="w-full"
      />
    </div>
    <ul class="flex-1 overflow-y-auto p-2">
      <MapTreeRow
        v-for="root in props.tree.roots"
        :id="root"
        :key="root"
        :tree="props.tree"
        :hidden="props.hidden"
        :labels="props.labels"
        :depth="0"
        :query="q"
        :selected="props.selected"
        @toggle="emit('toggle', $event)"
        @only="emit('only', $event)"
        @select="emit('select', $event)"
      />
    </ul>
  </aside>
</template>
