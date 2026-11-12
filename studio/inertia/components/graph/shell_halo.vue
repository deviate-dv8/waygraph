<script setup lang="ts">
/** The halo a shell draws behind one page it covers: halos of pages that touch merge into the shell's shape on the map. */
const props = defineProps<{ data: { width: number; height: number; selected?: boolean } }>()
</script>

<template>
  <div
    class="pointer-events-none rounded-2xl border-2 border-dashed"
    :class="
      props.data.selected
        ? 'border-(--color-sketch-500) bg-(--hatch-selected)'
        : 'border-(--island-line) bg-[color-mix(in_oklab,var(--ink)_5%,transparent)]'
    "
    :style="{ width: `${props.data.width}px`, height: `${props.data.height}px` }"
  />
</template>
