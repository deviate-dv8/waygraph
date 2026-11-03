<script setup lang="ts">
import AuthLayout from '~/layouts/auth.vue'
import { Link } from '@adonisjs/inertia/vue'
</script>

<template>
  <AuthLayout>
    <h1 class="font-hand text-3xl">Not on the map</h1>
    <p class="text-(--ink-soft)">There's no page here. Head back to the map.</p>
    <Link route="map" class="text-(--color-sketch-500) hover:underline">Back to the map</Link>
  </AuthLayout>
</template>
