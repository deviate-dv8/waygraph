<script setup lang="ts">
import { computed } from 'vue'
import { usePlay } from '~/lib/play'

/** A run's outcome as a badge: passed, failed, running (it's playing now) or stopped (its log never ended). */
const props = defineProps<{ id: string; ok: boolean | null; size?: 'sm' | 'md' }>()
const { isPlaying } = usePlay()

const look = computed(() => {
  if (props.ok === true)
    return { label: 'passed', color: 'success', icon: 'i-lucide-check' } as const
  if (props.ok === false) return { label: 'failed', color: 'error', icon: 'i-lucide-x' } as const
  return isPlaying(props.id)
    ? ({ label: 'running', color: 'warning', icon: 'i-lucide-loader' } as const)
    : ({ label: 'stopped', color: 'neutral', icon: 'i-lucide-square' } as const)
})
</script>

<template>
  <UBadge
    :label="look.label"
    :color="look.color"
    :icon="look.icon"
    :ui="{ leadingIcon: look.label === 'running' ? 'animate-spin' : '' }"
    variant="subtle"
    :size="props.size ?? 'sm'"
  />
</template>
