<script setup lang="ts">
import type { PageSummary } from '~/lib/project_graph'
import type { ManifestBlock } from '#types/project'

/** The selected page: its addresses, how you get there, what you can do and expect there, where it leads, what it shows. */
const props = defineProps<{ page: PageSummary; urls: string[]; image?: string | undefined }>()
defineEmits<{ close: [] }>()

const kindColor: Record<string, 'primary' | 'neutral' | 'success' | 'warning' | 'info'> = {
  nav: 'info',
  method: 'neutral',
  effect: 'warning',
  api: 'success',
  expect: 'primary',
}
const sections: {
  title: string
  icon: string
  key: 'waysIn' | 'actions' | 'expects' | 'leadsTo'
  empty: string
}[] = [
  { title: 'Ways in', icon: 'i-lucide-log-in', key: 'waysIn', empty: 'Nothing navigates here.' },
  {
    title: 'Do here',
    icon: 'i-lucide-mouse-pointer-click',
    key: 'actions',
    empty: 'No actions on this page.',
  },
  {
    title: 'Expect here',
    icon: 'i-lucide-badge-check',
    key: 'expects',
    empty: 'No Expect Blocks for this page.',
  },
  {
    title: 'Leads to',
    icon: 'i-lucide-log-out',
    key: 'leadsTo',
    empty: 'Nothing leaves from here.',
  },
]
const where = (b: ManifestBlock, key: string) =>
  key === 'waysIn'
    ? b.from.includes('*')
      ? b.url
        ? `opens ${b.url}`
        : 'from any page'
      : `from ${b.from.join(', ')}`
    : key === 'leadsTo'
      ? `to ${b.to.join(', ')}`
      : ''
</script>

<template>
  <aside class="island flex max-h-full w-[22rem] flex-col overflow-hidden">
    <div class="flex items-start justify-between gap-2 border-b border-(--island-line) p-4">
      <div>
        <p class="text-xs tracking-wide text-(--ink-soft) uppercase">Page</p>
        <h2 class="font-hand text-2xl leading-tight">{{ props.page.checkpoint }}</h2>
        <p
          v-for="url in props.urls"
          :key="url"
          class="font-mono text-xs break-all text-(--color-sketch-600) dark:text-(--color-sketch-300)"
        >
          {{ url }}
        </p>
        <p v-if="props.page.hubs.length" class="mt-1 text-xs text-(--ink-soft)">
          Page Block: {{ props.page.hubs.map((h) => h.exportName).join(', ') }}
        </p>
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

    <div class="flex-1 space-y-5 overflow-y-auto p-4">
      <a
        v-if="props.image"
        :href="props.image"
        target="_blank"
        rel="noreferrer"
        title="Open full size"
      >
        <img
          :src="props.image"
          :alt="`${props.page.checkpoint} as it last looked`"
          class="w-full rounded border border-(--island-line)"
        />
      </a>
      <section v-for="s in sections" :key="s.key">
        <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <UIcon :name="s.icon" class="size-4 text-(--ink-soft)" /> {{ s.title }}
          <span class="text-xs font-normal text-(--ink-soft)">{{ props.page[s.key].length }}</span>
        </h3>
        <p v-if="!props.page[s.key].length" class="text-xs text-(--ink-soft)">{{ s.empty }}</p>
        <ul class="space-y-2">
          <li v-for="b in props.page[s.key]" :key="b.id" class="text-sm">
            <div class="flex items-center gap-1.5">
              <UBadge
                :label="b.kind"
                :color="kindColor[b.kind] ?? 'neutral'"
                variant="subtle"
                size="sm"
              />
              <span class="font-medium">{{ b.name }}</span>
              <span class="text-xs text-(--ink-soft)">{{ where(b, s.key) }}</span>
            </div>
            <p v-if="b.description" class="mt-0.5 text-xs text-(--ink-soft)">{{ b.description }}</p>
          </li>
        </ul>
      </section>

      <section v-if="props.page.promised.length">
        <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <UIcon name="i-lucide-shield-check" class="size-4 text-(--ink-soft)" /> Promised on
          arrival
        </h3>
        <ul class="space-y-1">
          <li v-for="(p, i) in props.page.promised" :key="i" class="text-xs">
            <span class="text-(--ink-soft)">{{ p.block }}:</span> {{ p.text }}
          </li>
        </ul>
      </section>

      <section>
        <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <UIcon name="i-lucide-eye" class="size-4 text-(--ink-soft)" /> Shows
        </h3>
        <p v-if="!props.page.reads.length" class="text-xs text-(--ink-soft)">
          No Read Block reads this page.
        </p>
        <div v-for="r in props.page.reads" :key="r.id" class="mb-2">
          <p class="text-xs text-(--ink-soft)">{{ r.name }}</p>
          <ul class="mt-1 space-y-0.5 font-mono text-xs">
            <li v-for="(shape, key) in r.fields" :key="key" class="break-all">
              {{ key }}
              <span class="text-(--ink-soft)">{{
                typeof shape === 'string' ? shape : JSON.stringify(shape)
              }}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </aside>
</template>
