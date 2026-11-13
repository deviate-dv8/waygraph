<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import { urlFor } from '~/client'
import type { StepCall } from '#types/project'

/** The API console: a call a run made, sent again from here (edited or not), the answer in words. Nothing to install. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  calls: { runId: string; block: string; call: StepCall }[]
}>()

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const words: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
}
const statusText = (s: number) => (s === 0 ? 'No response' : words[s] ? `${s} ${words[s]}` : `${s}`)

const method = ref('GET')
const url = ref('')
const headers = ref('')
const body = ref('')
const answer = ref<{
  status: number
  ms: number
  headers: Record<string, string>
  body: string
} | null>(null)
const sending = ref(false)
const picked = ref<number | null>(null)

const pretty = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
const headerObject = () =>
  Object.fromEntries(
    headers.value
      .split('\n')
      .map((l) => l.split(/:\s*/, 2) as [string, string])
      .filter(([k, v]) => k && v !== undefined)
  )

/** A call a run made, in the form: its request as that run kept it (credentials were masked, so those headers are left out). */
async function pick(index: number) {
  const { runId, call } = props.calls[index]
  picked.value = index
  method.value = call.method
  url.value = call.url
  headers.value = ''
  body.value = ''
  answer.value = null
  if (!call.body) return
  try {
    const res = await fetch(urlFor('runs.call', { id: runId, file: call.body }))
    const data = await res.json()
    headers.value = Object.entries((data.request.headers ?? {}) as Record<string, string>)
      .filter(([k, v]) => v !== '••••' && !k.startsWith(':') && !/^(host|content-length)$/i.test(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    const sent = data.request.body
    body.value =
      sent === undefined ? '' : typeof sent === 'string' ? sent : JSON.stringify(sent, null, 2)
  } catch {
    /* the file is gone: the address and method are still there */
  }
}

function xsrf() {
  const found = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))
  return found ? decodeURIComponent(found.slice('XSRF-TOKEN='.length)) : ''
}

async function send() {
  sending.value = true
  try {
    const res = await fetch(urlFor('api.send'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-xsrf-token': xsrf() },
      body: JSON.stringify({
        method: method.value,
        url: url.value,
        headers: headerObject(),
        body: body.value,
      }),
    })
    const data = await res.json()
    answer.value = res.ok ? data : { status: 0, ms: 0, headers: {}, body: data.error ?? 'Not sent' }
  } finally {
    sending.value = false
  }
}

const curl = computed(() => {
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  let cmd = `curl -X ${method.value} ${q(url.value)}`
  for (const [k, v] of Object.entries(headerObject())) cmd += ` \\\n  -H ${q(`${k}: ${v}`)}`
  if (body.value) cmd += ` \\\n  --data ${q(body.value)}`
  return cmd
})

/** The request as an API Block, to paste into a Block file: the call is a step of a flow. */
const apiBlock = computed(() => {
  const name = `${method.value.toLowerCase()}-${new URL(url.value || 'http://x/').pathname.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'root'}`
  const options = [
    headers.value ? `headers: ${JSON.stringify(headerObject())}` : '',
    body.value
      ? `data: ${body.value.trim().startsWith('{') ? body.value.trim() : JSON.stringify(body.value)}`
      : '',
  ].filter(Boolean)
  return `import { checkpoint, defineApiBlock } from "waygraph";

const Done = checkpoint("Done");

export const ${name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())} = defineApiBlock({
  name: ${JSON.stringify(name)},
  method: ${JSON.stringify(method.value)},
  to: Done,
  call: ({ request }) =>
    request.${method.value.toLowerCase()}(${JSON.stringify(url.value)}${options.length ? `, { ${options.join(', ')} }` : ''}),
});
`
})

const copied = ref('')
async function copy(what: 'curl' | 'block') {
  await navigator.clipboard?.writeText(what === 'curl' ? curl.value : apiBlock.value)
  copied.value = what
  setTimeout(() => (copied.value = ''), 1200)
}
</script>

<template>
  <WorkspaceLayout :project="props.project" scroll>
    <h1 class="font-hand text-4xl">API</h1>
    <p class="mb-6 text-(--ink-soft)">
      Calls the runs made. Pick one, change it, send it again, then copy it as cURL or as an API
      Block.
    </p>
    <div class="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section class="island max-h-[70vh] space-y-1 overflow-y-auto p-3">
        <p v-if="!props.calls.length" class="text-sm text-(--ink-soft)">
          No calls yet: run a flow that calls the backend.
        </p>
        <button
          v-for="(c, i) in props.calls"
          :key="i"
          type="button"
          class="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-(--island-line)"
          :class="picked === i ? 'bg-(--island-line)' : ''"
          @click="pick(i)"
        >
          <span class="w-11 shrink-0 font-mono font-semibold">{{ c.call.method }}</span>
          <span class="min-w-0 flex-1 truncate font-mono" :title="c.call.url">{{
            c.call.route
          }}</span>
          <span :class="c.call.failed ? 'text-(--fail)' : ''" class="shrink-0">{{
            statusText(c.call.status)
          }}</span>
        </button>
      </section>
      <section class="island min-w-0 space-y-3 p-4">
        <div class="flex gap-2">
          <select
            v-model="method"
            class="rounded border border-(--island-line) bg-transparent px-2 text-sm"
          >
            <option v-for="m in METHODS" :key="m">{{ m }}</option>
          </select>
          <input
            v-model="url"
            placeholder="https://…"
            class="min-w-0 flex-1 rounded border border-(--island-line) bg-transparent px-2 py-1 font-mono text-sm"
          />
          <UButton :loading="sending" :disabled="!url" @click="send">Send</UButton>
        </div>
        <textarea
          v-model="headers"
          rows="3"
          placeholder="Headers, one per line: name: value"
          class="w-full rounded border border-(--island-line) bg-transparent p-2 font-mono text-xs"
        />
        <textarea
          v-model="body"
          rows="5"
          placeholder="Body"
          class="w-full rounded border border-(--island-line) bg-transparent p-2 font-mono text-xs"
        />
        <div class="flex gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :disabled="!url"
            @click="copy('curl')"
            >{{ copied === 'curl' ? 'Copied' : 'Copy as cURL' }}</UButton
          >
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :disabled="!url"
            @click="copy('block')"
            >{{ copied === 'block' ? 'Copied' : 'Copy as API Block' }}</UButton
          >
        </div>
        <div v-if="answer" class="space-y-2 border-t border-(--island-line) pt-3">
          <p
            class="text-sm font-semibold"
            :class="answer.status === 0 || answer.status >= 400 ? 'text-(--fail)' : ''"
          >
            {{ statusText(answer.status) }}
            <span class="font-normal text-(--ink-soft)">· {{ answer.ms }} ms</span>
          </p>
          <pre class="max-h-96 overflow-auto font-mono text-xs break-all whitespace-pre-wrap">{{
            pretty(answer.body)
          }}</pre>
          <details>
            <summary class="cursor-pointer text-xs text-(--ink-soft)">Response headers</summary>
            <pre class="font-mono text-xs break-all whitespace-pre-wrap">{{
              Object.entries(answer.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n')
            }}</pre>
          </details>
        </div>
      </section>
    </div>
  </WorkspaceLayout>
</template>
