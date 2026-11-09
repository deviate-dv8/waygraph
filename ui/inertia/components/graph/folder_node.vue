<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

/**
 * A folder on the site map: a path segment on the way to pages (`/platform/plant`), no page of its own. Only a label: it
 * groups the pages under it, it isn't a place a flow goes.
 */
const props = defineProps<{ data: { label: string; path: string } }>()
</script>

<template>
  <div
    class="flex items-center gap-1.5 rounded-md border border-dashed border-(--island-line) bg-(--paper) px-2.5 py-1.5 font-mono text-xs text-(--ink-soft)"
    :title="props.data.path"
  >
    <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" />
    {{ props.data.label }}
    <Handle id="in" type="target" :position="Position.Left" class="opacity-0" />
    <Handle id="out" type="source" :position="Position.Right" class="opacity-0" />
    <Handle id="up" type="target" :position="Position.Top" class="opacity-0" />
    <Handle id="down" type="source" :position="Position.Bottom" class="opacity-0" />
  </div>
</template>
