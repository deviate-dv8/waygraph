<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import ShapeTree from '~/components/map/shape_tree.vue'
import { urlFor } from '~/client'
import { count, duration } from '~/lib/format'
import { kindColor } from '~/lib/kinds'
import type { BlockStats, Json, ManifestBlock, ManifestReadBlock } from '#types/project'

/** Every Block of the project, by the folder it lives in, with what its runs say; its Read Blocks; its mem keys. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  blocks: ManifestBlock[]
  readBlocks: ManifestReadBlock[]
  usedBy: Record<string, string[]>
  stats: Record<string, BlockStats>
  runsRead: number
  mem: { key: string; requiredBy: string[]; example: Json }[]
}>()

const tabs = [
  { label: 'Blocks', value: 'blocks', icon: 'i-lucide-boxes' },
  { label: 'Read Blocks', value: 'reads', icon: 'i-lucide-eye' },
  { label: 'Mem keys', value: 'mem', icon: 'i-lucide-key-round' },
]
const tab = ref('blocks')
const query = ref('')
const q = computed(() => query.value.trim().toLowerCase())
const kinds = computed(() => [...new Set(props.blocks.map((b) => b.kind))].sort())
const kind = ref<string | null>(null)
const open = ref<string | null>(null)

/** The folder a Block lives in, under the project's map (`(app_base)/platform/plant/equipment/new`). */
const folderOf = (file: string) =>
  file
    .replace(/^src\/(map|blocks)\//, '')
    .split('/')
    .filter((part) => !part.startsWith('_') && !part.endsWith('.ts'))
    .join('/') || '/'

const groups = computed(() => {
  const shown = props.blocks.filter(
    (b) =>
      (!kind.value || b.kind === kind.value) &&
      (!q.value ||
        `${b.name} ${b.description} ${b.file} ${b.from} ${b.to}`.toLowerCase().includes(q.value))
  )
  const by = new Map<string, ManifestBlock[]>()
  for (const b of shown) by.set(folderOf(b.file), [...(by.get(folderOf(b.file)) ?? []), b])
  return [...by].sort(([a], [b]) => a.localeCompare(b))
})
const reads = computed(() =>
  props.readBlocks.filter(
    (r) =>
      !q.value || `${r.name} ${r.from} ${Object.keys(r.fields)}`.toLowerCase().includes(q.value)
  )
)
const keys = computed(() =>
  props.mem.filter((m) => !q.value || `${m.key} ${m.requiredBy}`.toLowerCase().includes(q.value))
)
const stat = (b: ManifestBlock): BlockStats | undefined => props.stats[b.name]
const short = (value: Json) => {
  const text = JSON.stringify(value)
  return text.length > 90 ? `${text.slice(0, 87)}...` : text
}
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <div class="mb-4 flex items-end justify-between gap-4">
      <div>
        <h1 class="font-hand text-4xl">Blocks</h1>
        <p class="text-(--ink-soft)">
          {{ count(props.blocks.length, 'Block') }},
          {{ count(props.readBlocks.length, 'Read Block') }},
          {{ count(props.mem.length, 'mem key') }}. What runs did: the newest
          {{ count(props.runsRead, 'run') }}.
        </p>
      </div>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Find by name, page or file"
        class="w-72"
      />
    </div>
    <UTabs v-model="tab" :items="tabs" :content="false" class="mb-4" />

    <template v-if="tab === 'blocks'">
      <div class="mb-4 flex flex-wrap items-center gap-1.5">
        <UButton
          label="All kinds"
          size="xs"
          :color="kind === null ? 'primary' : 'neutral'"
          variant="soft"
          @click="kind = null"
        />
        <UButton
          v-for="k in kinds"
          :key="k"
          :label="k"
          size="xs"
          :color="kind === k ? 'primary' : 'neutral'"
          variant="soft"
          class="font-mono"
          @click="kind = kind === k ? null : k"
        />
      </div>
      <section v-for="[folder, inFolder] in groups" :key="folder" class="mb-5">
        <h2 class="mb-2 flex items-center gap-1.5 font-mono text-sm text-(--ink-soft)">
          <UIcon name="i-lucide-folder" class="size-4" /> {{ folder }}
        </h2>
        <ul class="island divide-y divide-(--island-line)">
          <li v-for="b in inFolder" :key="b.id">
            <button
              type="button"
              class="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-(--island-line)"
              @click="open = open === b.id ? null : b.id"
            >
              <UBadge
                :label="b.kind"
                :color="kindColor(b.kind)"
                variant="subtle"
                size="sm"
                class="mt-0.5 font-mono"
              />
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="font-medium">{{ b.name }}</span>
                  <span class="text-xs text-(--ink-soft)"
                    >{{ b.from.join(', ') }} → {{ b.to.join(' | ') }}</span
                  >
                  <UBadge
                    v-if="stat(b)?.moves.length && b.kind !== 'nav' && b.kind !== 'page'"
                    label="navigates"
                    icon="i-lucide-arrow-right-left"
                    color="warning"
                    variant="subtle"
                    size="sm"
                  />
                  <UBadge
                    v-if="stat(b)?.addressOnly"
                    label="changes the address"
                    icon="i-lucide-link"
                    color="info"
                    variant="subtle"
                    size="sm"
                  />
                </p>
                <p v-if="b.description" class="truncate text-xs text-(--ink-soft)">
                  {{ b.description }}
                </p>
              </div>
              <span class="shrink-0 text-xs text-(--ink-soft)">
                <template v-if="stat(b)">
                  {{ count(stat(b)!.runs, 'run') }}
                  <span v-if="stat(b)!.failed" class="text-(--fail)"
                    >· {{ stat(b)!.failed }} failed</span
                  >
                </template>
                <template v-else>not run</template>
              </span>
            </button>
            <div v-if="open === b.id" class="space-y-3 bg-(--paper) px-4 pt-1 pb-4 text-sm">
              <p class="font-mono text-xs break-all text-(--ink-soft)">
                {{ b.file }} · {{ b.exportName }}
              </p>
              <p v-if="b.url" class="text-xs">
                Opens <span class="font-mono">{{ b.url }}</span>
              </p>
              <div v-if="b.requires.length" class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-(--ink-soft)">Requires</span>
                <UBadge
                  v-for="k in b.requires"
                  :key="k"
                  :label="k"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="font-mono"
                />
              </div>
              <div v-if="b.expect.length" class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-(--ink-soft)">Expects</span>
                <UBadge
                  v-for="e in b.expect"
                  :key="e"
                  :label="e"
                  color="primary"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <div v-if="stat(b)" class="space-y-1 text-xs">
                <p>
                  <span class="text-(--ink-soft)">In runs:</span> {{ stat(b)!.passed }} passed,
                  {{ stat(b)!.failed }} failed<template v-if="stat(b)!.ms !== null"
                    >, {{ duration(stat(b)!.ms!) }} on average</template
                  >.
                </p>
                <p v-for="m in stat(b)!.moves" :key="`${m.from}>${m.to}`">
                  <span class="text-(--ink-soft)">Went from</span>
                  <span class="font-mono">{{ m.from }}</span>
                  <span class="text-(--ink-soft)">to</span>
                  <span class="font-mono">{{ m.to }}</span>
                  <span class="text-(--ink-soft)">({{ count(m.count, 'time') }})</span>
                </p>
                <p v-if="stat(b)!.addressOnly">
                  <span class="text-(--ink-soft)">Stayed on its page but changed the address</span>
                  {{ count(stat(b)!.addressOnly, 'time') }} (a tab or a filter kept in the url).
                </p>
              </div>
              <div
                v-if="props.usedBy[b.name]?.length"
                class="flex flex-wrap items-center gap-1.5 text-xs"
              >
                <span class="text-(--ink-soft)"
                  >Used by {{ count(props.usedBy[b.name]!.length, 'flow') }}</span
                >
                <ULink
                  v-for="f in props.usedBy[b.name]!.slice(0, 12)"
                  :key="f"
                  :to="urlFor('flows.show', { name: f })"
                  class="font-mono hover:underline"
                  >{{ f }}</ULink
                >
                <span v-if="props.usedBy[b.name]!.length > 12" class="text-(--ink-soft)"
                  >+{{ props.usedBy[b.name]!.length - 12 }}</span
                >
              </div>
              <p v-else class="text-xs text-(--ink-soft)">No flow uses it.</p>
            </div>
          </li>
        </ul>
      </section>
      <p v-if="!groups.length" class="text-(--ink-soft)">No Block matches.</p>
    </template>

    <ul v-else-if="tab === 'reads'" class="space-y-3">
      <li v-for="r in reads" :key="r.id" class="island p-4">
        <p class="font-medium">{{ r.name }}</p>
        <p class="text-xs text-(--ink-soft)">
          on {{ r.from.length ? r.from.join(', ') : 'every page' }} ·
          <span class="font-mono">{{ r.file }}</span>
        </p>
        <p v-if="r.description" class="mt-1 text-xs">{{ r.description }}</p>
        <ul class="mt-2 space-y-1">
          <ShapeTree
            v-for="(shape, field) in r.fields"
            :key="field"
            :name="String(field)"
            :shape="shape"
          />
        </ul>
      </li>
    </ul>

    <ul v-else class="island divide-y divide-(--island-line)">
      <li v-for="m in keys" :key="m.key" class="px-4 py-2.5 text-sm">
        <p class="font-mono font-medium">{{ m.key }}</p>
        <p class="text-xs text-(--ink-soft)">Required by {{ m.requiredBy.join(', ') }}</p>
        <p v-if="m.example !== null" class="font-mono text-xs break-all">
          <span class="text-(--ink-soft)">newest run:</span> {{ short(m.example) }}
        </p>
      </li>
    </ul>
  </WorkspaceLayout>
</template>
