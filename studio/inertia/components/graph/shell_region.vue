<script setup lang="ts">
import { inject } from 'vue'

/** A shell's tag on the map: its name, links (chips: valid from every page it covers, so no line per page) and interrupts. */
const props = defineProps<{
  data: {
    label: string
    node: string
    links: { name: string; to: string; closed?: boolean }[]
    interrupts: string[]
    selected?: boolean
  }
}>()
const selectPage = inject<(id: string) => void>('selectPage', () => {})
const selectShell = inject<(id: string) => void>('selectShell', () => {})
</script>

<template>
  <div
    class="flex w-max max-w-[24rem] flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1"
    :class="
      props.data.selected
        ? 'border-(--color-sketch-500) bg-(--paper)'
        : 'border-(--island-line) bg-(--paper)'
    "
  >
    <button
      type="button"
      class="flex items-center gap-1 font-hand text-base leading-none text-(--ink) hover:underline"
      :title="`The ${props.data.label} shell: what it declares is on every page it covers`"
      @click.stop="selectShell(props.data.node)"
    >
      <UIcon name="i-lucide-panels-top-left" class="size-4" />{{ props.data.label }}
    </button>
    <UBadge
      v-for="l in props.data.links"
      :key="l.name"
      :label="l.name"
      icon="i-lucide-arrow-right"
      color="info"
      variant="subtle"
      size="sm"
      class="cursor-pointer"
      :title="`${props.data.label} › ${l.name}: from any page it covers, to ${l.to === 'parent' ? 'the page above' : l.to}`"
      @click.stop="l.to !== 'parent' && selectPage(l.to)"
    />
    <UBadge
      v-for="i in props.data.interrupts"
      :key="`i-${i}`"
      :label="i"
      icon="i-lucide-bell-ring"
      color="warning"
      variant="subtle"
      size="sm"
      :title="`${i}: handled wherever it shows up on these pages`"
    />
  </div>
</template>
