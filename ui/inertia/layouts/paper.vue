<script setup lang="ts">
import AppLogo from '~/components/app_logo.vue'
import SketchBox from '~/components/sketch/sketch_box.vue'

/** A page of its own (not found, an error): one hand-drawn card on the dotted paper. */
</script>

<template>
  <UApp>
    <div
      class="flex min-h-dvh items-center justify-center bg-[radial-gradient(var(--dot)_1.3px,transparent_1.3px)] bg-size-[22px_22px] p-4"
    >
      <SketchBox seed="paper" fill="var(--paper)" fill-style="solid" class="w-full max-w-sm">
        <div class="space-y-5 p-8">
          <AppLogo />
          <slot />
        </div>
      </SketchBox>
    </div>
  </UApp>
</template>
