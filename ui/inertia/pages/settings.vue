<script setup lang="ts">
import WorkspaceLayout from '~/layouts/workspace.vue'
import { appPages } from '~/lib/pages'
import { useSettings } from '~/lib/settings'

/** How this app plays flows and what its sidebar shows. Kept in this browser. */
const props = defineProps<{ project: { name: string; dir: string; waygraph: string } }>()
const settings = useSettings()
const pages = appPages()

/** Shows or hides a page in the sidebar. */
const show = (id: string, shown: boolean) => {
  const hidden = settings.value.hiddenPages.filter((p) => p !== id)
  settings.value.hiddenPages = shown ? hidden : [...hidden, id]
}
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <h1 class="font-hand text-4xl">Settings</h1>
    <p class="mb-6 text-(--ink-soft)">
      How flows play from here, and what the sidebar shows. Kept in this browser.
    </p>

    <section class="island mb-4 space-y-4 p-5">
      <h2 class="flex items-center gap-1.5 font-semibold">
        <UIcon name="i-lucide-monitor-play" class="size-4 text-(--ink-soft)" /> Demo
      </h2>
      <USwitch
        v-model="settings.autoNext"
        label="Auto-advance"
        description="Each step moves on by itself after a moment (--auto-next). Off: the demo waits for Next on every step. The step panel's own switch still changes it while a demo plays."
      />
    </section>

    <section class="island mb-4 space-y-4 p-5">
      <h2 class="flex items-center gap-1.5 font-semibold">
        <UIcon name="i-lucide-video" class="size-4 text-(--ink-soft)" /> Recording
      </h2>
      <USwitch
        v-model="settings.video"
        label="Record a video"
        description="Runs and demos played from here record the browser (--video). The run's page plays it and saves it."
      />
    </section>

    <section class="island space-y-3 p-5">
      <h2 class="flex items-center gap-1.5 font-semibold">
        <UIcon name="i-lucide-panel-left" class="size-4 text-(--ink-soft)" /> Sidebar
      </h2>
      <p class="text-sm text-(--ink-soft)">
        The pages the sidebar shows. A hidden one still opens by its address, and shows while you're
        on it.
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <USwitch
          v-for="p in pages"
          :key="p.id"
          :model-value="!settings.hiddenPages.includes(p.id)"
          :label="p.label"
          :aria-label="`Show ${p.label} in the sidebar`"
          @update:model-value="show(p.id, $event)"
        >
          <template #label>
            <span class="flex items-center gap-1.5"
              ><UIcon :name="p.icon" class="size-4" /> {{ p.label }}</span
            >
          </template>
        </USwitch>
      </div>
    </section>
  </WorkspaceLayout>
</template>
