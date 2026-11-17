<script setup lang="ts">
import { computed } from 'vue'
import type { ManifestFlow } from '#types/project'

/** What a flow says about itself (`map({ title, description, labels, ticket, owner, video })`) and how it is set up. */
const props = defineProps<{ flow: ManifestFlow }>()

const rows = computed(() => {
  const f = props.flow
  return [
    ['title', f.title],
    ['description', f.description],
    ['labels', f.labels?.length ? f.labels.join(', ') : undefined],
    ['ticket', f.ticket],
    ['owner', f.owner],
    ['video', f.video],
    ['file', f.file],
    ['use case', f.useCase.path.length ? f.useCase.path.join(' / ') : undefined],
    ...Object.entries(f.settings).map(([k, v]) => [k, v === true ? 'on' : String(v)]),
    ['panes', f.panes?.map((p) => (p.as ? `${p.name} as ${p.as}` : p.name)).join(', ')],
    ['given', f.given?.join(', ')],
    ['given groups', f.givenGroups?.join(', ')],
    ['needs', f.inputs?.map((i) => i.key).join(', ')],
  ].filter((r): r is [string, string] => typeof r[1] === 'string' && r[1] !== '')
})
</script>

<template>
  <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
    <template v-for="[k, v] in rows" :key="k">
      <dt class="text-(--ink-soft)">{{ k }}</dt>
      <dd class="font-mono break-words" :class="k === 'description' ? 'font-sans' : ''">{{ v }}</dd>
    </template>
    <p v-if="!rows.length" class="col-span-2 text-(--ink-soft)">Nothing set.</p>
  </dl>
</template>
