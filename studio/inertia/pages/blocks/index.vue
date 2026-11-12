<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import ShapeTree from '~/components/map/shape_tree.vue'
import BlockDetail from '~/components/block_detail.vue'
import { count } from '~/lib/format'
import { kindColor } from '~/lib/kinds'
import type {
  BlockStats,
  Json,
  ManifestBlock,
  ManifestPage,
  ManifestReadBlock,
  SelectorEntry,
} from '#types/project'

/** Every Block of the project, by the folder it lives in, with what its runs say; its Read Blocks; its mem keys. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  blocks: ManifestBlock[]
  /** Every Page Block (waygraph 0.18.0+). */
  pages: ManifestPage[]
  readBlocks: ManifestReadBlock[]
  usedBy: Record<string, string[]>
  stats: Record<string, BlockStats>
  runsRead: number
  mem: { key: string; requiredBy: string[]; example: Json }[]
  /** Every selector file's entries; null when the project's waygraph doesn't list them. */
  selectors: SelectorEntry[] | null
}>()

const tabs = [
  { label: 'Pages', value: 'pages', icon: 'i-lucide-file-text' },
  { label: 'Blocks', value: 'blocks', icon: 'i-lucide-boxes' },
  { label: 'Reads', value: 'reads', icon: 'i-lucide-eye' },
  { label: 'Selectors', value: 'selectors', icon: 'i-lucide-crosshair' },
  { label: 'Mem keys', value: 'mem', icon: 'i-lucide-key-round' },
]
const tab = ref(props.pages.length ? 'pages' : 'blocks')
const query = ref('')
const q = computed(() => query.value.trim().toLowerCase())
/** The pages (and shells), by the query, each with how its moves and expectations went in the runs read. */
const pageRows = computed(() =>
  props.pages
    .filter(
      (p) =>
        !q.value ||
        `${p.name} ${p.checkpoint ?? ''} ${p.file} ${p.do.map((d) => d.key)}`
          .toLowerCase()
          .includes(q.value)
    )
    .map((p) => {
      const names = [...p.do, ...p.expects].flatMap((e) => (e.block ? [e.block] : []))
      const failed = names.filter((n) => (props.stats[n]?.failed ?? 0) > 0).length
      const ran = names.filter((n) => (props.stats[n]?.runs ?? 0) > 0).length
      return { page: p, failed, ran, total: names.length }
    })
    .sort((a, b) => a.page.file.localeCompare(b.page.file))
)
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
/** Each selector file's entries, with the Blocks that read each. */
const usersOf = computed(() => {
  const users = new Map<string, string[]>()
  for (const b of props.blocks)
    for (const sel of b.selectors ?? [])
      users.set(sel.name, [...(users.get(sel.name) ?? []), b.name])
  return users
})
const selectorFiles = computed(() => {
  const by = new Map<string, SelectorEntry[]>()
  for (const sel of props.selectors ?? []) {
    if (q.value && !`${sel.name} ${sel.selector} ${sel.file}`.toLowerCase().includes(q.value))
      continue
    by.set(sel.file, [...(by.get(sel.file) ?? []), sel])
  }
  return [...by]
})
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
        <h1 class="font-hand text-4xl">{{ props.pages.length ? 'Pages' : 'Blocks' }}</h1>
        <p class="text-(--ink-soft)">
          {{ count(props.pages.length, 'page') }}, {{ count(props.blocks.length, 'Block') }},
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

    <template v-if="tab === 'pages'">
      <ul class="island divide-y divide-(--island-line)">
        <li v-for="r in pageRows" :key="r.page.id" class="px-4 py-2.5">
          <button
            type="button"
            class="flex w-full items-start gap-2 text-left"
            @click="open = open === r.page.id ? null : r.page.id"
          >
            <UIcon
              :name="r.page.bare ? 'i-lucide-panels-top-left' : 'i-lucide-file-text'"
              class="mt-0.5 size-4 shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="font-medium">{{ r.page.checkpoint ?? r.page.name }}</span>
                <UBadge
                  v-if="r.page.bare"
                  label="shell"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
                <UBadge
                  v-if="r.page.covers"
                  :label="`covers ${count(r.page.coveredPages.length, 'page')}`"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
                <span class="text-xs text-(--ink-soft)">{{ r.page.file }}</span>
              </p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-(--ink-soft)">
                <span v-if="r.page.opensBy">opens by {{ r.page.opensBy }}</span>
                <span>{{ count(r.page.do.length, 'move') }}</span>
                <span>{{ count(r.page.expects.length, 'expectation') }}</span>
                <span v-if="r.page.links.length">{{ count(r.page.links.length, 'link') }}</span>
                <span v-if="r.page.interrupts.length">{{
                  count(r.page.interrupts.length, 'interrupt')
                }}</span>
                <span v-if="r.page.coveredBy.length">under {{ r.page.coveredBy.join(', ') }}</span>
              </p>
            </div>
            <UBadge
              v-if="r.failed"
              :label="`${r.failed} failing`"
              color="error"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-else-if="r.ran"
              :label="`${r.ran}/${r.total} run`"
              color="success"
              variant="subtle"
              size="sm"
            />
          </button>
          <div
            v-if="open === r.page.id"
            class="mt-2 ml-6 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2"
          >
            <div>
              <p class="mb-1 text-xs font-medium text-(--ink-soft)">Moves</p>
              <p v-for="d in r.page.do" :key="d.key" class="font-mono text-xs">
                {{ d.key
                }}<span v-if="d.params" class="text-(--ink-soft)">({{ d.params.join(', ') }})</span>
              </p>
            </div>
            <div>
              <p class="mb-1 text-xs font-medium text-(--ink-soft)">Expects</p>
              <p v-for="e in r.page.expects" :key="e.key" class="text-xs">
                <span class="font-mono">{{ e.key }}</span>
                <span v-if="e.description" class="text-(--ink-soft)"> · {{ e.description }}</span>
              </p>
            </div>
          </div>
        </li>
      </ul>
    </template>

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
                <p v-if="b.description && open !== b.id" class="truncate text-xs text-(--ink-soft)">
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
            <div v-if="open === b.id" class="bg-(--paper) px-4 pt-1 pb-4">
              <p class="mb-2 font-mono text-[11px] break-all text-(--ink-soft)">
                {{ b.file }}<template v-if="b.source">:{{ b.source.line }}</template> ·
                {{ b.exportName }}
              </p>
              <BlockDetail :block="b" :stat="stat(b)" :used-by="props.usedBy[b.name] ?? []" />
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

    <template v-else-if="tab === 'selectors'">
      <p v-if="!props.selectors" class="text-(--ink-soft)">
        The project's waygraph doesn't list selectors yet (0.16.19 or later does).
      </p>
      <p v-else-if="!selectorFiles.length" class="text-(--ink-soft)">No selector matches.</p>
      <section v-for="[file, entries] in selectorFiles" :key="file" class="mb-5">
        <h2 class="mb-2 flex items-center gap-1.5 font-mono text-sm text-(--ink-soft)">
          <UIcon name="i-lucide-file-code" class="size-4" /> {{ file }}
        </h2>
        <ul class="island divide-y divide-(--island-line)">
          <li v-for="sel in entries" :key="sel.name" class="flex items-start gap-3 px-4 py-2">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ sel.name }}</p>
              <code
                class="block font-mono text-xs break-all"
                :class="sel.literal ? 'text-(--code-str)' : 'text-(--ink-soft)'"
                >{{ sel.selector }}</code
              >
            </div>
            <div class="flex max-w-[45%] flex-wrap justify-end gap-1">
              <UBadge
                v-for="user in usersOf.get(sel.name) ?? []"
                :key="user"
                :label="user"
                color="neutral"
                variant="subtle"
                size="sm"
              />
              <span v-if="!usersOf.has(sel.name)" class="text-xs text-(--ink-soft)"
                >no Block reads it</span
              >
            </div>
          </li>
        </ul>
      </section>
    </template>

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
