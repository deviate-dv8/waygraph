<script setup lang="ts">
import { usePlayOptions } from '~/lib/play'

/** The switches next to Run and Demo: record a video, show the browser. Kept in this browser. */
const options = usePlayOptions()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
    <USwitch v-model="options.video" label="Record video" size="sm" />
    <UTooltip text="Off: it plays headless, out of sight">
      <USwitch v-model="options.headed" label="Show the browser" size="sm" />
    </UTooltip>
  </div>
</template>
