<script setup lang="ts">
import type { ManifestLayout } from '#types/project'

/**
 * The selected shell: a page that covers pages (the UI they share). Its links (where each leads, its selector, who sees it), its actions,
 * what it shows, and the pages it covers.
 */
const props = defineProps<{ layout: ManifestLayout }>()
defineEmits<{ close: []; select: [page: string] }>()

const destination = (to: string) => (to === 'parent' ? 'the page above' : to)
</script>

<template>
  <aside class="island flex max-h-full w-[26rem] flex-col overflow-hidden">
    <div class="flex items-start gap-3 border-b border-(--island-line) p-4">
      <div class="min-w-0 flex-1">
        <h2 class="flex items-center gap-1.5 font-hand text-2xl leading-tight">
          <UIcon name="i-lucide-panels-top-left" class="size-5" />{{ props.layout.name }}
        </h2>
        <p class="truncate font-mono text-xs text-(--ink-soft)" :title="props.layout.file">
          {{ props.layout.file }}
        </p>
        <p class="mt-1 text-xs text-(--ink-soft)">
          On every page it covers: its links are there, and what pops up on them is handled.
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

    <div class="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
      <section v-if="props.layout.links.length">
        <h3 class="mb-1.5 flex items-center gap-1.5 font-medium">
          <UIcon name="i-lucide-compass" class="size-4" />Links
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="link in props.layout.links"
            :key="link.name"
            class="flex flex-wrap items-center gap-1.5"
          >
            <span class="font-mono text-xs">{{ link.name }}</span>
            <UIcon name="i-lucide-arrow-right" class="size-3 text-(--ink-soft)" />
            <span class="text-xs">{{ destination(link.to) }}</span>
            <code v-if="link.selector" class="text-[11px] text-(--ink-soft)">{{
              link.selector
            }}</code>
            <UBadge
              :label="link.for ? `only ${link.for.join(', ')}` : 'everyone'"
              :icon="link.for ? 'i-lucide-lock' : 'i-lucide-users'"
              :color="link.for ? 'warning' : 'neutral'"
              variant="subtle"
              size="sm"
            />
          </li>
        </ul>
      </section>
      <section v-if="props.layout.actions.length">
        <h3 class="mb-1.5 flex items-center gap-1.5 font-medium">
          <UIcon name="i-lucide-mouse-pointer-click" class="size-4" />Actions
        </h3>
        <ul class="space-y-1">
          <li v-for="a in props.layout.actions" :key="a.name" class="font-mono text-xs">
            {{ a.name }} <span class="text-(--ink-soft)">({{ a.block }})</span>
          </li>
        </ul>
      </section>
      <section v-if="props.layout.read">
        <h3 class="mb-1.5 flex items-center gap-1.5 font-medium">
          <UIcon name="i-lucide-eye" class="size-4" />Shows
        </h3>
        <p class="font-mono text-xs">{{ props.layout.read }}</p>
      </section>
      <section v-if="props.layout.interrupts?.length">
        <h3 class="mb-1.5 flex items-center gap-1.5 font-medium">
          <UIcon name="i-lucide-bell-ring" class="size-4" />Handles when it shows up
        </h3>
        <p class="flex flex-wrap gap-1">
          <UBadge
            v-for="name in props.layout.interrupts"
            :key="name"
            :label="name"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </p>
      </section>
      <section>
        <h3 class="mb-1.5 flex items-center gap-1.5 font-medium">
          <UIcon name="i-lucide-file" class="size-4" />Pages ({{ props.layout.covers.length }})
        </h3>
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="page in props.layout.covers"
            :key="page"
            :label="page"
            size="xs"
            color="neutral"
            variant="outline"
            @click="$emit('select', page)"
          />
        </div>
      </section>
    </div>
  </aside>
</template>
