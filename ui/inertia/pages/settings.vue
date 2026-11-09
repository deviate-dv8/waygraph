<script setup lang="ts">
import WorkspaceLayout from '~/layouts/workspace.vue'
import { useSettings } from '~/lib/settings'

/** How this app plays flows. Kept in this browser. */
const props = defineProps<{ project: { name: string; dir: string; waygraph: string } }>()
const settings = useSettings()
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <h1 class="font-hand text-4xl">Settings</h1>
    <p class="mb-6 text-(--ink-soft)">How flows play from here. Kept in this browser.</p>

    <section class="island space-y-4 p-5">
      <h2 class="flex items-center gap-1.5 font-semibold">
        <UIcon name="i-lucide-monitor-play" class="size-4 text-(--ink-soft)" /> Demo
      </h2>
      <USwitch
        v-model="settings.autoNext"
        label="Auto-advance"
        description="Each step moves on by itself after a moment (--auto-next). Off: the demo waits for Next on every step. The step panel's own switch still changes it while a demo plays."
      />
    </section>
  </WorkspaceLayout>
</template>
