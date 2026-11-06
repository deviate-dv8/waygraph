<script setup lang="ts">
import PaperLayout from '~/layouts/paper.vue'
import { Link } from '@adonisjs/inertia/vue'
</script>

<template>
  <PaperLayout>
    <h1 class="font-hand text-3xl">Something broke</h1>
    <p class="text-(--ink-soft)">
      The server couldn't answer that. The terminal running the UI has the details.
    </p>
    <Link route="map" class="text-(--color-sketch-500) hover:underline">Back to the map</Link>
  </PaperLayout>
</template>
