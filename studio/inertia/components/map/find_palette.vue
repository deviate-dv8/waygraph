<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { router } from '@inertiajs/vue3'
import { urlFor } from '~/client'
import { kindIcon } from '~/lib/kinds'
import type { ManifestBlock } from '#types/project'

/**
 * Find anything by name: a page, a Block, a flow. Opens with `/` or Ctrl/Cmd-K (or the button), so a project of hundreds
 * of Blocks never needs scrolling: type a few letters, Enter.
 */
const props = defineProps<{
  pages: string[]
  blocks: ManifestBlock[]
  flows: { name: string; steps: number }[]
}>()
const emit = defineEmits<{ page: [checkpoint: string]; block: [id: string] }>()

const open = ref(false)
const term = ref('')

/** The keys that open it, unless the user is typing somewhere. */
useEventListener('keydown', (event: KeyboardEvent) => {
  const typing = (event.target as HTMLElement | null)?.closest(
    'input, textarea, select, [contenteditable]'
  )
  if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
    event.preventDefault()
    open.value = true
  }
})

const choose = (action: () => void) => () => {
  open.value = false
  term.value = ''
  action()
}

const groups = computed(() => [
  {
    id: 'pages',
    label: 'Pages',
    items: props.pages.map((p) => ({
      label: p,
      icon: 'i-lucide-file-text',
      onSelect: choose(() => emit('page', p)),
    })),
  },
  {
    id: 'flows',
    label: 'Flows',
    items: props.flows.map((f) => ({
      label: f.name,
      suffix: `${f.steps} steps`,
      icon: 'i-lucide-route',
      onSelect: choose(() => router.visit(urlFor('flows.show', { name: f.name }))),
    })),
  },
  {
    id: 'blocks',
    label: 'Blocks',
    items: props.blocks.map((b) => ({
      label: b.name,
      suffix: b.kind,
      icon: kindIcon(b.kind),
      onSelect: choose(() => emit('block', b.id)),
    })),
  },
])
</script>

<template>
  <UModal
    v-model:open="open"
    title="Find"
    description="Find a page, a flow or a Block by name"
    :ui="{ content: 'max-w-xl' }"
  >
    <UButton
      icon="i-lucide-search"
      label="Find"
      size="sm"
      color="neutral"
      variant="outline"
      class="island"
      aria-label="Find a page, a flow or a Block"
    >
      <template #trailing>
        <UKbd value="/" />
      </template>
    </UButton>
    <template #content>
      <UCommandPalette
        v-model:search-term="term"
        :groups="groups"
        placeholder="Find a page, a flow or a Block…"
        class="h-96"
        :fuse="{ resultLimit: 40 }"
      />
    </template>
  </UModal>
</template>
