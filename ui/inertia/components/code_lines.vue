<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { tokenize } from '@speed-highlight/core'
import { urlFor } from '~/client'
import type { SourceLines, SourceSpan } from '#types/project'

/**
 * Lines of a project file (a Block's definition, a selector entry), coloured, with their line numbers. Fetched when
 * shown; opening another before it arrives cancels the first request.
 */
const props = defineProps<{ file: string; span: SourceSpan; mark?: number }>()

type Token = { text: string; type: string | undefined }
const lines = ref<{ n: number; tokens: Token[] }[] | null>(null)
const error = ref<string | null>(null)
let pending: AbortController | null = null

/** Each line's tokens: the highlighter's tokens split at line ends. */
async function colour(source: SourceLines): Promise<{ n: number; tokens: Token[] }[]> {
  const out: { n: number; tokens: Token[] }[] = [{ n: source.from, tokens: [] }]
  await tokenize(source.lines.join('\n'), 'ts', (text, type) => {
    text.split('\n').forEach((part, i) => {
      if (i > 0) out.push({ n: out[out.length - 1]!.n + 1, tokens: [] })
      if (part) out[out.length - 1]!.tokens.push({ text: part, type })
    })
  })
  return out
}

async function load() {
  pending?.abort()
  const controller = new AbortController()
  pending = controller
  lines.value = null
  error.value = null
  const url = `${urlFor('sources.show')}?${new URLSearchParams({ file: props.file, from: String(props.span.line), to: String(props.span.endLine) })}`
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok)
      throw new Error(
        response.status === 404 ? 'The file is gone or moved.' : `HTTP ${response.status}`
      )
    const coloured = await colour((await response.json()) as SourceLines)
    if (!controller.signal.aborted) lines.value = coloured
  } catch (err) {
    if (!controller.signal.aborted) error.value = err instanceof Error ? err.message : String(err)
  }
}
watch(() => [props.file, props.span.line, props.span.endLine], load, { immediate: true })
onBeforeUnmount(() => pending?.abort())
</script>

<template>
  <div class="overflow-hidden rounded-md border border-(--island-line) bg-(--paper)">
    <p
      class="truncate border-b border-(--island-line) px-3 py-1 font-mono text-[11px] text-(--ink-soft)"
      :title="props.file"
    >
      {{ props.file }}:{{ props.span.line }}
    </p>
    <p v-if="error" class="px-3 py-2 text-xs text-(--fail)">{{ error }}</p>
    <USkeleton v-else-if="!lines" class="m-3 h-24" />
    <pre v-else class="overflow-x-auto py-2 font-mono text-[11.5px] leading-[1.55]"><code><span
      v-for="line in lines"
      :key="line.n"
      class="flex"
      :class="line.n === props.mark ? 'bg-(--color-sketch-100) dark:bg-(--color-sketch-950)' : ''"
    ><span class="w-10 shrink-0 pr-3 text-right text-(--ink-soft) select-none opacity-60">{{ line.n }}</span><span class="pr-3"><span
      v-for="(t, i) in line.tokens"
      :key="i"
      :class="t.type ? `code-${t.type}` : ''"
    >{{ t.text }}</span></span></span></code></pre>
  </div>
</template>

<style scoped>
.code-kwd {
  color: var(--code-kwd);
}
.code-str,
.code-esc {
  color: var(--code-str);
}
.code-cmnt {
  color: var(--code-cmnt);
  font-style: italic;
}
.code-func {
  color: var(--code-func);
}
.code-num,
.code-bool {
  color: var(--code-num);
}
.code-type,
.code-class {
  color: var(--code-type);
}
.code-oper {
  color: var(--ink-soft);
}
</style>
