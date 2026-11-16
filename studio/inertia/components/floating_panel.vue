<script setup lang="ts">
import { ref } from 'vue'
import { useDraggable, useStorage } from '@vueuse/core'

/** An island that floats over the canvas: dragged by its header, folded to the header, where it was left kept in this browser. */
const props = defineProps<{ id: string; title: string; start: { top: number; right: number } }>()

const box = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)
const folded = useStorage(`waygraph-panel-folded:${props.id}`, false)
const saved = useStorage<{ x: number; y: number } | null>(`waygraph-panel-at:${props.id}`, null)
const { x, y } = useDraggable(box, {
  handle,
  initialValue: saved.value ?? {
    x: Math.max(0, window.innerWidth - 480 - props.start.right),
    y: props.start.top,
  },
  onEnd: (at) => (saved.value = { x: at.x, y: at.y }),
})
</script>

<template>
  <aside
    ref="box"
    class="island fixed z-20 flex w-[30rem] max-w-[calc(100vw-1.5rem)] flex-col"
    :style="{ left: `${x}px`, top: `${y}px` }"
  >
    <div
      ref="handle"
      class="flex cursor-move items-center justify-between gap-2 px-3 pt-2 pb-1 select-none"
    >
      <p class="text-sm font-semibold">{{ props.title }}</p>
      <div class="flex items-center gap-1" @pointerdown.stop>
        <slot name="actions" />
        <UButton
          :icon="folded ? 'i-lucide-chevron-down' : 'i-lucide-minus'"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="folded ? 'Open' : 'Minimize'"
          @click="folded = !folded"
        />
      </div>
    </div>
    <div v-show="!folded" class="max-h-[48vh] space-y-2 overflow-y-auto px-3 pb-3">
      <slot />
    </div>
  </aside>
</template>
