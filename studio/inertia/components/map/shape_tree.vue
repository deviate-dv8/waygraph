<script setup lang="ts">
import { computed } from 'vue'
import ShapeTree from '~/components/map/shape_tree.vue'
import type { Json } from '#types/project'

/**
 * One field of what a page shows, as its Read Block's shape describes it: its name and type (a badge), and for a list
 * or an object, its fields nested under it.
 */
const props = defineProps<{ name: string; shape: Json }>()

/** A type's badge colour: text, numbers and yes/no read apart at a glance. */
const TYPE_COLOR: Record<string, 'neutral' | 'info' | 'warning' | 'success'> = {
  string: 'neutral',
  number: 'info',
  boolean: 'warning',
}

const view = computed(() => {
  const shape = props.shape
  if (typeof shape === 'string') return { kind: 'value' as const, type: shape }
  if (Array.isArray(shape)) {
    const item = shape[0] ?? null
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return { kind: 'list' as const, fields: Object.entries(item) }
    }
    return { kind: 'value' as const, type: `list of ${typeof item === 'string' ? item : 'values'}` }
  }
  if (shape !== null && typeof shape === 'object')
    return { kind: 'object' as const, fields: Object.entries(shape) }
  return { kind: 'value' as const, type: JSON.stringify(shape) }
})
</script>

<template>
  <li class="text-xs">
    <div class="flex items-center gap-1.5">
      <span class="font-mono">{{ props.name }}</span>
      <UBadge
        v-if="view.kind === 'value'"
        :label="view.type"
        :color="TYPE_COLOR[view.type] ?? 'neutral'"
        variant="subtle"
        size="sm"
      />
      <UBadge
        v-else-if="view.kind === 'list'"
        label="list of"
        color="primary"
        variant="subtle"
        size="sm"
      />
    </div>
    <ul
      v-if="view.kind !== 'value'"
      class="mt-1 ml-1.5 space-y-1 border-l border-(--island-line) pl-3"
    >
      <ShapeTree v-for="[field, inner] in view.fields" :key="field" :name="field" :shape="inner" />
    </ul>
  </li>
</template>
