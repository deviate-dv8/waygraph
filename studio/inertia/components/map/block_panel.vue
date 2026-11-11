<script setup lang="ts">
import BlockDetail from '~/components/block_detail.vue'
import { kindColor, kindIcon } from '~/lib/kinds'
import type { ManifestBlock } from '#types/project'

/** The selected Block (a badge on a line): what a page's list shows when a Block is opened, beside the map. */
const props = defineProps<{ block: ManifestBlock }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <aside class="island flex max-h-full w-[26rem] flex-col overflow-hidden">
    <div class="flex items-start gap-3 border-b border-(--island-line) p-4">
      <div class="min-w-0 flex-1">
        <h2 class="font-hand text-2xl leading-tight break-all">{{ props.block.name }}</h2>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-(--ink-soft)">
          <UBadge
            :label="props.block.kind"
            :icon="kindIcon(props.block.kind)"
            :color="kindColor(props.block.kind)"
            variant="subtle"
            size="sm"
          />
          <span class="font-mono"
            >{{ props.block.from.join(', ') }} → {{ props.block.to.join(', ') }}</span
          >
        </div>
      </div>
      <UButton
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Close"
        @click="$emit('close')"
      />
    </div>
    <div class="flex-1 overflow-y-auto p-4">
      <BlockDetail :block="props.block" />
    </div>
  </aside>
</template>
