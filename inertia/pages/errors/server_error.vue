<script setup lang="ts">
import AuthLayout from '~/layouts/auth.vue'
import { Link } from '@adonisjs/inertia/vue'
</script>

<template>
  <AuthLayout>
    <h1 class="font-hand text-3xl">Something broke</h1>
    <p class="text-(--ink-soft)">
      The server couldn't answer that. The terminal running the UI has the details.
    </p>
    <Link route="map" class="text-(--color-sketch-500) hover:underline">Back to the map</Link>
  </AuthLayout>
</template>
