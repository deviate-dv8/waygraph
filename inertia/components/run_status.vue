<script setup lang="ts">
/** A run's outcome as a badge: passed, failed, or still running (no end in its log). */
const props = defineProps<{ ok: boolean | null; size?: 'sm' | 'md' }>()
</script>

<template>
  <UBadge
    :label="props.ok === null ? 'running' : props.ok ? 'passed' : 'failed'"
    :color="props.ok === null ? 'warning' : props.ok ? 'success' : 'error'"
    :icon="props.ok === null ? 'i-lucide-loader' : props.ok ? 'i-lucide-check' : 'i-lucide-x'"
    variant="subtle"
    :size="props.size ?? 'sm'"
  />
</template>
