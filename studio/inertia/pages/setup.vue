<script setup lang="ts">
import WorkspaceLayout from '~/layouts/workspace.vue'
import SketchBox from '~/components/sketch/sketch_box.vue'

/** No project yet: how to point Waygraph Studio at one. */
</script>

<template>
  <WorkspaceLayout :project="null" scroll>
    <SketchBox seed="setup" class="mx-auto mt-10 max-w-xl">
      <div class="space-y-3 p-8">
        <h1 class="font-hand text-3xl">Point me at a project</h1>
        <p class="text-(--ink-soft)">
          Set <code class="rounded bg-(--island-line) px-1">WAYGRAPH_PROJECT_DIR</code> in
          <code class="rounded bg-(--island-line) px-1">.env</code> to a waygraph project's folder
          (the one with <code>config/waygraph.config.ts</code> and <code>src/</code>), then reload.
        </p>
        <pre class="rounded-lg bg-(--island-line) p-3 text-sm">
WAYGRAPH_PROJECT_DIR=/path/to/my-app</pre>
        <p class="text-sm text-(--ink-soft)">
          Studio reads what the project's own waygraph reports and the run logs it writes; it never
          changes the project.
        </p>
      </div>
    </SketchBox>
  </WorkspaceLayout>
</template>
