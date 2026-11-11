<script setup lang="ts">
import { KIND_MEANING, MOVE_KINDS, kindColor, kindIcon } from '~/lib/kinds'

/** What the map's shapes, lines and badges mean: drawn the way the map draws them. */
</script>

<template>
  <div class="w-[22rem] space-y-4 p-4 text-sm">
    <section class="space-y-2">
      <p class="text-xs font-semibold tracking-wide text-(--ink-soft) uppercase">Shapes</p>
      <div class="flex items-center gap-3">
        <span
          class="font-hand shrink-0 rounded-full border-2 border-(--ink) px-3 py-0.5 text-sm italic"
          >site.com</span
        >
        <span>A site: the base url's host, or another site a page's address names</span>
      </div>
      <div class="flex items-center gap-3">
        <span
          class="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-(--island-line) px-2 py-0.5 font-mono text-xs text-(--ink-soft)"
        >
          <UIcon name="i-lucide-folder" class="size-3.5" /> auth/
        </span>
        <span>A folder: a part of the address no page has</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-hand shrink-0 border-2 border-(--ink) px-3 py-1 text-base italic"
          >Login</span
        >
        <span>A page (a Checkpoint): where a flow can be</span>
      </div>
      <div class="flex items-center gap-3">
        <span
          class="font-hand flex shrink-0 items-center gap-1 border-x-4 border-y-2 border-double border-(--ink) px-3 py-1 text-base italic"
        >
          <UIcon name="i-lucide-panels-top-left" class="size-4" /> menu
        </span>
        <span
          >A layout: UI many pages share (a menu, a sidebar). Its lines go where its links lead,
          from every page marked with its name</span
        >
      </div>
      <div class="flex items-center gap-3">
        <span
          class="flex shrink-0 items-center gap-1 rounded border border-(--island-line) px-2 py-0.5 text-xs"
        >
          <UIcon name="i-lucide-user-round" class="size-3.5" /> As planner
        </span>
        <span>Only what one account is given (for): what it can't open or see is left out</span>
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-xs font-semibold tracking-wide text-(--ink-soft) uppercase">Lines</p>
      <div class="flex items-center gap-3">
        <svg width="56" height="10" class="shrink-0" aria-hidden="true">
          <line
            x1="0"
            y1="5"
            x2="56"
            y2="5"
            stroke="var(--ink-soft)"
            stroke-width="1.5"
            stroke-dasharray="5 4"
          />
        </svg>
        <span>Where a page sits in its site, by its address</span>
      </div>
      <div class="flex items-center gap-3">
        <svg width="56" height="10" class="shrink-0" aria-hidden="true">
          <line x1="0" y1="5" x2="50" y2="5" stroke="var(--ink)" stroke-width="1.5" />
          <path d="M44 1 L52 5 L44 9" fill="none" stroke="var(--ink)" stroke-width="1.5" />
        </svg>
        <span>A move from one page to another, labelled with the Blocks that make it</span>
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-xs font-semibold tracking-wide text-(--ink-soft) uppercase">
        Blocks on a line
      </p>
      <div v-for="k in [...MOVE_KINDS, 'expect']" :key="k" class="flex items-start gap-3">
        <UBadge
          :label="k"
          :icon="kindIcon(k)"
          :color="kindColor(k)"
          variant="subtle"
          size="sm"
          class="w-20 shrink-0 font-mono"
        />
        <span>{{ KIND_MEANING[k] }}</span>
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-xs font-semibold tracking-wide text-(--ink-soft) uppercase">In a page's box</p>
      <ul class="space-y-1.5">
        <li class="flex items-center gap-2">
          <UIcon name="i-lucide-image" class="size-4 shrink-0 text-(--ink-soft)" /> Its newest
          screenshot
        </li>
        <li class="flex items-center gap-2">
          <span class="font-mono text-xs text-(--color-sketch-600) dark:text-(--color-sketch-300)"
            >/auth/login</span
          >
          its address
        </li>
        <li class="flex items-center gap-2">
          <span class="shrink-0 text-xs">2 do</span> what you can do there (its Methods)
        </li>
        <li class="flex items-center gap-2">
          <UIcon name="i-lucide-route" class="size-4 shrink-0 text-(--ink-soft)" />
          <span
            >the flows that pass through it,
            <span class="text-(--fail)">and how many failed</span></span
          >
        </li>
        <li class="flex flex-wrap items-center gap-1.5">
          <span class="rounded border border-(--island-line) px-1.5 font-mono text-xs">email</span>
          <span
            class="rounded border border-(--color-sketch-300) bg-(--color-sketch-100) px-1.5 font-mono text-xs text-(--color-sketch-700) dark:bg-(--color-sketch-900) dark:text-(--color-sketch-200)"
            >linkSent</span
          >
          what it shows (its Read Block); highlighted, the yes/no states it can be in
        </li>
      </ul>
    </section>
    <p class="text-xs text-(--ink-soft)">
      Click a page for all of it: its Blocks, their code, its selectors, its flows.
    </p>
  </div>
</template>
