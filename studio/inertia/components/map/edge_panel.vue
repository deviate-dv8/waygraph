<script setup lang="ts">
import { computed } from 'vue'
import { kindColor, kindIcon } from '~/lib/kinds'
import type { ManifestBlock, MapEdge } from '#types/project'

/** A selected line: the move between two pages, its Blocks, and what each does to the states. */
const props = defineProps<{
  edge: MapEdge
  /** The states the page it leads to needs, by name. */
  needs: string[]
}>()
const emit = defineEmits<{ close: []; block: [id: string] }>()
const stateName = (key: string) => key.split('.').pop() ?? key
const sets = (b: ManifestBlock) =>
  (b.sets ?? []).map((s) =>
    typeof s.value === 'string'
      ? `${stateName(s.key)} = ${s.value}`
      : `${s.value ? 'turns on' : 'turns off'} ${stateName(s.key)}`
  )
const title = computed(() => `${props.edge.source} → ${props.edge.target}`)
</script>

<template>
  <aside class="island flex max-h-full w-[26rem] flex-col overflow-hidden">
    <div class="flex items-start gap-3 border-b border-(--island-line) p-4">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-(--ink-soft) uppercase">move</p>
        <h2 class="font-hand text-2xl leading-tight break-all">{{ title }}</h2>
      </div>
      <UButton
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Close"
        @click="emit('close')"
      />
    </div>
    <div class="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
      <p v-if="props.needs.length" class="flex items-center gap-1.5 text-xs text-(--ink-soft)">
        <UIcon name="i-lucide-lock" class="size-3.5" />
        {{ props.edge.target }} needs {{ props.needs.join(', ') }}
      </p>
      <ul class="space-y-2">
        <li v-for="b in props.edge.blocks" :key="b.id" class="space-y-1">
          <button
            type="button"
            class="flex items-center gap-1.5 text-left"
            @click="emit('block', b.id)"
          >
            <UBadge
              :label="b.kind"
              :icon="kindIcon(b.kind)"
              :color="kindColor(b.kind)"
              variant="subtle"
              size="sm"
            />
            <span class="font-mono hover:underline">{{ b.name }}</span>
          </button>
          <p v-if="b.description" class="text-xs text-(--ink-soft)">{{ b.description }}</p>
          <p
            v-for="line in sets(b)"
            :key="line"
            class="flex items-center gap-1.5 text-xs text-(--ink-soft)"
          >
            <UIcon name="i-lucide-toggle-right" class="size-3.5" />
            {{ line }}
          </p>
        </li>
      </ul>
    </div>
  </aside>
</template>
