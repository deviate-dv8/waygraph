<script setup lang="ts">
import { computed, h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import WorkspaceLayout from '~/layouts/workspace.vue'
import RunStatus from '~/components/run_status.vue'
import { urlFor } from '~/client'
import { ago, duration } from '~/lib/format'
import { runTitle } from '~/lib/runs'
import type { RunSummary } from '#types/project'

/** Every run the project logged, newest first. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  runs: RunSummary[]
}>()

const ULink = resolveComponent('ULink')
const columns: TableColumn<RunSummary>[] = [
  {
    accessorKey: 'ok',
    header: 'Result',
    cell: ({ row }) => h(RunStatus, { id: row.original.id, ok: row.original.ok }),
  },
  {
    accessorKey: 'flows',
    header: 'Played',
    cell: ({ row }) =>
      h(
        ULink,
        { to: urlFor('runs.show', { id: row.original.id }), class: 'font-medium hover:underline' },
        () => runTitle(row.original)
      ),
  },
  { accessorKey: 'startedAt', header: 'When', cell: ({ row }) => ago(row.original.startedAt) },
  { accessorKey: 'ms', header: 'Took', cell: ({ row }) => duration(row.original.ms) },
  { accessorKey: 'steps', header: 'Steps' },
  { accessorKey: 'failedAt', header: 'Failed at', cell: ({ row }) => row.original.failedAt ?? '' },
]
const failed = computed(() => props.runs.filter((r) => r.ok === false).length)
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <div class="mb-6">
      <h1 class="font-hand text-4xl">Runs</h1>
      <p class="text-(--ink-soft)">
        {{ props.runs.length }} runs logged · {{ failed }} failed. Every run, demo and test writes
        one.
      </p>
    </div>
    <div class="island overflow-hidden">
      <UTable :data="props.runs" :columns="columns" class="w-full" />
    </div>
  </WorkspaceLayout>
</template>
