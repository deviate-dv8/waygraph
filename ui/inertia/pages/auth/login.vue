<script setup lang="ts">
import AuthLayout from '~/layouts/auth.vue'
import { Form, Link } from '@adonisjs/inertia/vue'
</script>

<template>
  <AuthLayout>
    <div>
      <h1 class="font-hand text-2xl">Welcome back</h1>
      <p class="text-sm text-(--ink-soft)">Sign in to see your project.</p>
    </div>
    <Form v-slot="{ processing, errors }" route="session.store" class="space-y-4">
      <UFormField label="Email" :error="errors.email">
        <UInput
          name="email"
          type="email"
          autocomplete="username"
          placeholder="you@example.com"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Password" :error="errors.password">
        <UInput name="password" type="password" autocomplete="current-password" class="w-full" />
      </UFormField>
      <UButton type="submit" block :loading="processing" label="Sign in" />
    </Form>
    <p class="text-sm text-(--ink-soft)">
      New here?
      <Link route="new_account.create" class="text-(--color-sketch-500) hover:underline"
        >Create an account</Link
      >
    </p>
  </AuthLayout>
</template>
