<script setup lang="ts">
import AuthLayout from '~/layouts/auth.vue'
import { Form, Link } from '@adonisjs/inertia/vue'
</script>

<template>
  <AuthLayout>
    <div>
      <h1 class="font-hand text-2xl">Create an account</h1>
      <p class="text-sm text-(--ink-soft)">One account per person who looks at the project.</p>
    </div>
    <Form v-slot="{ processing, errors }" route="new_account.store" class="space-y-4">
      <UFormField label="Full name" :error="errors.fullName">
        <UInput name="fullName" autocomplete="name" class="w-full" />
      </UFormField>
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
        <UInput name="password" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UFormField label="Confirm password" :error="errors.passwordConfirmation">
        <UInput
          name="passwordConfirmation"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <UButton type="submit" block :loading="processing" label="Create account" />
    </Form>
    <p class="text-sm text-(--ink-soft)">
      Have an account?
      <Link route="session.create" class="text-(--color-sketch-500) hover:underline">Sign in</Link>
    </p>
  </AuthLayout>
</template>
