<script setup lang="ts">
/** A lane's name, at its start: the pane a row of steps plays in. */
const props = defineProps<{ data: { label: string } }>()
</script>

<template>
  <div
    class="flex items-center gap-1.5 rounded-md border border-dashed border-(--island-line) bg-(--paper) px-2.5 py-1.5 text-sm text-(--ink-soft)"
  >
    <UIcon name="i-lucide-columns-2" class="size-4 shrink-0" />
    <span class="font-hand text-base text-(--ink)">{{ props.data.label }}</span>
  </div>
</template>
