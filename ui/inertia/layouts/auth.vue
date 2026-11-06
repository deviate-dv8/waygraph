<script setup lang="ts">
import AppLogo from '~/components/app_logo.vue'
import SketchBox from '~/components/sketch/sketch_box.vue'

/** Sign-in and sign-up: one hand-drawn card on the dotted paper. */
</script>

<template>
  <UApp>
    <div
      class="flex min-h-dvh items-center justify-center bg-[radial-gradient(var(--dot)_1.3px,transparent_1.3px)] bg-size-[22px_22px] p-4"
    >
      <SketchBox seed="auth" fill="var(--paper)" fill-style="solid" class="w-full max-w-sm">
        <div class="space-y-5 p-8">
          <AppLogo />
          <slot />
        </div>
      </SketchBox>
    </div>
  </UApp>
</template>
