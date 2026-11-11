<script setup lang="ts">
import { computed, ref } from 'vue'
import CodeLines from '~/components/code_lines.vue'
import { urlFor } from '~/client'
import { PREFETCH } from '~/lib/prefetch'
import { count, duration } from '~/lib/format'
import type { BlockStats, ManifestBlock, ManifestCheck } from '#types/project'

/**
 * One Block, most telling first: where it goes, what it checks, the selectors it uses, its code; then what runs did
 * with it and the flows that use it. The Blocks page and a page's panel on the map both show it.
 */
const props = defineProps<{
  block: ManifestBlock
  stat?: BlockStats | undefined
  usedBy?: string[] | undefined
}>()

const checks = computed(() => props.block.checks)
const listOf = (list: ManifestCheck[] | 'dynamic' | undefined) =>
  list === undefined || list === 'dynamic' ? [] : list
const checkCount = computed(
  () =>
    listOf(checks.value?.verify).length +
    listOf(checks.value?.precondition).length +
    props.block.expect.length
)
const tabs = computed(() => [
  {
    label: 'Checks',
    value: 'checks',
    icon: 'i-lucide-shield-check',
    badge: checkCount.value || undefined,
  },
  {
    label: 'Selectors',
    value: 'selectors',
    icon: 'i-lucide-crosshair',
    badge: props.block.selectors?.length || undefined,
  },
  ...(props.block.source ? [{ label: 'Code', value: 'code', icon: 'i-lucide-code' }] : []),
  // What runs did with it, where the page knows (the Blocks page reads the runs; the map doesn't).
  ...(props.usedBy !== undefined
    ? [
        {
          label: 'Runs',
          value: 'runs',
          icon: 'i-lucide-history',
          badge: props.usedBy.length || undefined,
        },
      ]
    : []),
])
const tab = ref('checks')
</script>

<template>
  <div class="space-y-3 text-sm">
    <div class="flex flex-wrap items-center gap-1.5">
      <UBadge
        v-for="t in props.block.from"
        :key="`from-${t}`"
        :label="t === '*' ? 'any page' : t"
        color="neutral"
        variant="outline"
        size="sm"
      />
      <UIcon name="i-lucide-arrow-right" class="size-3.5 text-(--ink-soft)" />
      <UBadge
        v-for="t in props.block.to"
        :key="`to-${t}`"
        :label="t"
        color="primary"
        variant="soft"
        size="sm"
      />
      <UBadge
        v-if="props.block.url"
        :label="props.block.url"
        icon="i-lucide-link"
        color="info"
        variant="subtle"
        size="sm"
        class="font-mono"
      />
    </div>
    <p v-if="props.block.description" class="text-(--ink-soft)">{{ props.block.description }}</p>
    <div v-if="props.block.requires.length" class="flex flex-wrap items-center gap-1.5">
      <UIcon name="i-lucide-key-round" class="size-3.5 text-(--ink-soft)" />
      <UBadge
        v-for="k in props.block.requires"
        :key="k"
        :label="k"
        color="neutral"
        variant="subtle"
        size="sm"
        class="font-mono"
      />
    </div>

    <UTabs v-model="tab" :items="tabs" :content="false" size="xs" variant="link" />

    <div v-if="tab === 'checks'" class="space-y-2">
      <p v-if="!checks" class="text-xs text-(--ink-soft)">
        The project's waygraph doesn't list checks yet (0.16.19 or later does).
      </p>
      <template v-else>
        <div v-for="phase in ['precondition', 'verify'] as const" :key="phase">
          <template v-if="checks[phase] === 'dynamic' || checks[phase].length">
            <p class="mb-1 text-xs font-medium text-(--ink-soft)">
              {{ phase === 'verify' ? 'On arrival' : 'Before acting' }}
            </p>
            <p v-if="checks[phase] === 'dynamic'" class="text-xs text-(--ink-soft)">
              Built by a function, per outcome: see the code.
            </p>
            <ul v-else class="space-y-1">
              <li
                v-for="(c, i) in listOf(checks[phase])"
                :key="i"
                class="flex items-start gap-1.5 rounded-md border border-(--island-line) px-2 py-1"
              >
                <UIcon name="i-lucide-check" class="mt-0.5 size-3.5 shrink-0 text-(--pass)" />
                <div class="min-w-0">
                  <p class="text-xs">{{ c.wants ?? c.name }}</p>
                  <p
                    v-if="c.wants"
                    class="truncate font-mono text-[11px] text-(--ink-soft)"
                    :title="c.name"
                  >
                    {{ c.name }}
                  </p>
                </div>
              </li>
            </ul>
          </template>
        </div>
        <div v-if="props.block.expect.length">
          <p class="mb-1 text-xs font-medium text-(--ink-soft)">Promises, wherever it's used</p>
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="e in props.block.expect"
              :key="e"
              :label="e"
              color="primary"
              variant="subtle"
              size="sm"
            />
          </div>
        </div>
        <p v-if="!checkCount && checks.verify !== 'dynamic'" class="text-xs text-(--ink-soft)">
          It checks nothing: a step that didn't take effect would pass.
        </p>
      </template>
    </div>

    <div v-else-if="tab === 'selectors'">
      <p v-if="!props.block.selectors" class="text-xs text-(--ink-soft)">
        The project's waygraph doesn't list selectors yet (0.16.19 or later does).
      </p>
      <p v-else-if="!props.block.selectors.length" class="text-xs text-(--ink-soft)">
        It reads no entry of a selector file (its selectors, if any, are written in its code).
      </p>
      <ul v-else class="space-y-1.5">
        <li
          v-for="s in props.block.selectors"
          :key="s.name"
          class="rounded-md border border-(--island-line) px-2 py-1.5"
        >
          <p class="flex items-center justify-between gap-2 text-xs">
            <span class="font-medium">{{ s.name }}</span>
            <span
              class="truncate font-mono text-[11px] text-(--ink-soft)"
              :title="`${s.file}:${s.line}`"
              >{{ s.file.split('/').pop() }}:{{ s.line }}</span
            >
          </p>
          <code
            class="mt-0.5 block font-mono text-[11.5px] break-all"
            :class="s.literal ? 'text-(--code-str)' : 'text-(--ink-soft)'"
            >{{ s.selector }}</code
          >
        </li>
      </ul>
    </div>

    <CodeLines
      v-else-if="tab === 'code' && props.block.source"
      :file="props.block.file"
      :span="props.block.source"
    />

    <div v-else-if="tab === 'runs'" class="space-y-2 text-xs">
      <div v-if="props.stat" class="flex flex-wrap items-center gap-1.5">
        <UBadge :label="`${props.stat.passed} passed`" color="success" variant="subtle" size="sm" />
        <UBadge
          v-if="props.stat.failed"
          :label="`${props.stat.failed} failed`"
          color="error"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="props.stat.ms !== null"
          :label="`${duration(props.stat.ms)} on average`"
          icon="i-lucide-timer"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>
      <p v-else class="text-(--ink-soft)">No run played it yet.</p>
      <p v-for="m in props.stat?.moves ?? []" :key="`${m.from}>${m.to}`">
        <span class="text-(--ink-soft)">Went from</span> <span class="font-mono">{{ m.from }}</span>
        <span class="text-(--ink-soft)">to</span> <span class="font-mono">{{ m.to }}</span>
        <span class="text-(--ink-soft)">({{ count(m.count, 'time') }})</span>
      </p>
      <p v-if="props.stat?.addressOnly">
        <span class="text-(--ink-soft)">Stayed on its page but changed the address</span>
        {{ count(props.stat.addressOnly, 'time') }} (a tab or a filter kept in the url).
      </p>
      <template v-if="props.usedBy">
        <p class="pt-1 font-medium text-(--ink-soft)">
          {{
            props.usedBy.length
              ? `Used by ${count(props.usedBy.length, 'flow')}`
              : 'No flow uses it.'
          }}
        </p>
        <div class="flex flex-wrap gap-1">
          <ULink
            v-for="f in props.usedBy.slice(0, 24)"
            :key="f"
            :to="urlFor('flows.show', { name: f })"
            v-bind="PREFETCH"
            class="rounded border border-(--island-line) px-1.5 py-0.5 font-mono hover:bg-(--island-line)"
            >{{ f }}</ULink
          >
          <span v-if="props.usedBy.length > 24" class="text-(--ink-soft)"
            >+{{ props.usedBy.length - 24 }}</span
          >
        </div>
      </template>
    </div>
  </div>
</template>
