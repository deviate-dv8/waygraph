<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkspaceLayout from '~/layouts/workspace.vue'
import StepPipeline from '~/components/graph/step_pipeline.vue'
import RunStatus from '~/components/run_status.vue'
import PlayOptions from '~/components/play_options.vue'
import { urlFor } from '~/client'
import { ago, count, duration, hostOf, shortUrl } from '~/lib/format'
import { runTitle } from '~/lib/runs'
import { usePlay } from '~/lib/play'
import type { RunDetail, StepCall } from '#types/project'

/** One run: its steps on the canvas, coloured by how each went, and the failure, the page's data and the mem it used. */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string }
  run: RunDetail
  /** What the flow expects after each step, when the run is of one flow. */
  expects: string[][]
}>()

/** The call opened in the step panel, with what it sent and got back (fetched from the run's call file). */
const openCall = ref<{
  call: StepCall
  data: {
    request: { headers?: Record<string, string>; body?: unknown }
    response: { headers?: Record<string, string>; body?: unknown }
  } | null
} | null>(null)
async function showCall(run: string, call: StepCall) {
  if (openCall.value?.call === call) return void (openCall.value = null)
  openCall.value = { call, data: null }
  if (!call.body) return
  try {
    const res = await fetch(urlFor('runs.call', { id: run, file: call.body }))
    if (res.ok && openCall.value?.call === call) openCall.value.data = await res.json()
  } catch {
    /* the file is gone: the summary is still there */
  }
}
const pretty = (value: unknown) =>
  value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
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
const statusText = (s: number) =>
  s === 0 ? 'No response' : words[s] ? `${s} ${words[s]}` : String(s)

/** The site the run started on: a step on it shows only its path. */
const home = computed(() => hostOf(props.run.stepsList.find((s) => s.url)?.url))
const failedIndex = computed(() => props.run.stepsList.findIndex((s) => s.status === 'failed'))
const selected = ref<number | null>(failedIndex.value >= 0 ? failedIndex.value : null)
// A run that fails while it's watched opens its failure.
watch(failedIndex, (index) => {
  if (index >= 0 && selected.value === null) selected.value = index
})
const pipeline = computed(() =>
  props.run.stepsList.map((s, i) => ({
    name: s.block,
    kind: s.kind,
    description: s.cleanup ? 'cleanup' : `${s.from} → ${s.to ?? '?'}`,
    ...(s.url ? { url: shortUrl(s.url, home.value) } : {}),
    expects: props.expects[i] ?? [],
    status: s.status,
    ms: s.ms,
    pane: s.pane ?? null,
    diffs: s.diffs ?? [],
  }))
)
const step = computed(() =>
  selected.value === null ? null : (props.run.stepsList[selected.value] ?? null)
)

const { play, playing, isPlaying, start } = usePlay()
/** What the play that wrote this run printed, while this app still has it. */
const output = computed(() => (play.value?.runId === props.run.id ? play.value.output : []))
/** A run of one flow can be played again, as a run or a demo, with the mem it was seeded with. */
const again = computed(() => (props.run.flows.length === 1 ? props.run.flows[0] : null))
/** Its videos and traces, by their place among the run's artifacts (how the server finds them). */
const recordings = computed(() =>
  props.run.artifacts
    .map((a, index) => ({ ...a, index, url: urlFor('runs.artifact', { id: props.run.id, index }) }))
    .filter((a) => a.kind === 'video' || a.kind === 'trace')
)
const videos = computed(() => recordings.value.filter((a) => a.kind === 'video'))
const traces = computed(() => recordings.value.filter((a) => a.kind === 'trace'))
const watching = ref(false)
</script>

<template>
  <WorkspaceLayout :project="props.project">
    <StepPipeline :steps="pipeline" :selected="selected" @select="selected = $event" />
    <div
      v-if="!pipeline.length"
      class="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center"
    >
      <p class="font-hand text-2xl text-(--ink-soft)">
        {{
          isPlaying(props.run.id)
            ? play?.mode === 'demo'
              ? 'The demo is open in its browser: its steps show here as they play.'
              : 'Waiting for the first step…'
            : 'No step was played.'
        }}
      </p>
    </div>

    <div class="island absolute bottom-3 left-3 max-w-lg space-y-1 px-4 py-3">
      <div class="flex items-center gap-2">
        <RunStatus :id="props.run.id" :ok="props.run.ok" size="md" />
        <p class="font-hand text-2xl leading-tight">{{ runTitle(props.run) }}</p>
      </div>
      <p class="text-xs text-(--ink-soft)">
        {{ ago(props.run.startedAt) }} ·
        <template v-if="props.run.ms !== null">{{ duration(props.run.ms) }} ·</template>
        {{ count(props.run.steps, 'step') }} · <span class="font-mono">{{ props.run.id }}</span>
      </p>
      <div
        v-if="props.run.flows.length || recordings.length || output.length"
        class="flex flex-wrap gap-1 pt-1"
      >
        <UButton
          v-for="f in props.run.flows"
          :key="f"
          :to="urlFor('flows.show', { name: f })"
          :label="`flow ${f}`"
          icon="i-lucide-route"
          size="xs"
          color="neutral"
          variant="outline"
        />
        <template v-if="again">
          <UButton
            label="Run again"
            icon="i-lucide-rotate-ccw"
            size="xs"
            :disabled="playing"
            @click="start(again, 'run', { replay: props.run.id })"
          />
          <UTooltip
            text="Opens a browser with the step panel around each step, with this run's mem"
          >
            <UButton
              label="Demo again"
              icon="i-lucide-monitor-play"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="playing"
              @click="start(again, 'demo', { replay: props.run.id })"
            />
          </UTooltip>
        </template>
        <UModal
          v-if="videos.length"
          v-model:open="watching"
          :title="`Video of ${runTitle(props.run)}`"
          :ui="{ content: 'max-w-5xl' }"
        >
          <UButton
            label="Video"
            icon="i-lucide-video"
            size="xs"
            color="neutral"
            variant="outline"
          />
          <template #body>
            <div class="space-y-3">
              <video
                v-for="v in videos"
                :key="v.index"
                :src="v.url"
                controls
                autoplay
                class="w-full rounded border border-(--island-line) bg-black"
              />
            </div>
          </template>
          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton
                v-for="(v, i) in videos"
                :key="v.index"
                :href="`${v.url}?download`"
                external
                :label="videos.length > 1 ? `Download video ${i + 1}` : 'Download video'"
                icon="i-lucide-download"
                size="sm"
              />
            </div>
          </template>
        </UModal>
        <UTooltip
          v-for="t in traces"
          :key="t.index"
          text="Playwright's trace: open it with npx playwright show-trace"
        >
          <UButton
            :href="`${t.url}?download`"
            external
            label="Trace"
            icon="i-lucide-download"
            size="xs"
            color="neutral"
            variant="outline"
          />
        </UTooltip>
        <UPopover v-if="output.length">
          <UButton
            label="Output"
            icon="i-lucide-terminal"
            size="xs"
            color="neutral"
            variant="outline"
          />
          <template #content>
            <pre
              class="max-h-96 max-w-2xl overflow-auto p-3 font-mono text-xs whitespace-pre-wrap"
              >{{ output.join('\n') }}</pre>
          </template>
        </UPopover>
      </div>
      <PlayOptions v-if="again" class="pt-1" />
    </div>

    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-start p-3 pt-16">
      <aside
        v-if="step"
        class="island pointer-events-auto flex max-h-full w-96 flex-col overflow-hidden"
      >
        <div class="flex items-start justify-between border-b border-(--island-line) p-4">
          <div>
            <p class="text-xs text-(--ink-soft) uppercase">
              step {{ step.index + 1 }} · {{ step.kind }} · {{ duration(step.ms) }}
            </p>
            <h2 class="font-hand text-2xl leading-tight break-words">{{ step.block }}</h2>
            <p class="text-xs text-(--ink-soft)">
              {{ step.from }} → {{ step.to ?? 'failed before landing' }}
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Close"
            @click="selected = null"
          />
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          <a
            v-if="step.screenshot"
            :href="urlFor('screenshots.step', { id: props.run.id, file: step.screenshot })"
            target="_blank"
            rel="noreferrer"
            title="Open full size"
          >
            <img
              :src="urlFor('screenshots.step', { id: props.run.id, file: step.screenshot })"
              :alt="`The page after ${step.block}`"
              class="w-full rounded border border-(--island-line)"
            />
          </a>
          <p v-if="step.url" class="flex items-start gap-1.5 text-xs">
            <UIcon name="i-lucide-globe" class="mt-0.5 size-3.5 shrink-0 text-(--ink-soft)" />
            <a
              :href="step.url"
              target="_blank"
              rel="noreferrer"
              class="font-mono break-all text-(--color-sketch-600) hover:underline dark:text-(--color-sketch-300)"
              >{{ step.url }}</a
            >
          </p>
          <div v-if="step.calls.length" class="space-y-1">
            <p class="text-xs font-semibold text-(--ink-soft) uppercase">API calls</p>
            <template v-for="(call, i) in step.calls" :key="i">
              <button
                type="button"
                class="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-(--island-line)"
                :class="call.external ? 'opacity-60' : ''"
                @click="showCall(props.run.id, call)"
              >
                <span class="w-11 shrink-0 font-mono font-semibold">{{ call.method }}</span>
                <span class="min-w-0 flex-1 truncate font-mono" :title="call.url">{{
                  call.route
                }}</span>
                <span :class="call.failed ? 'text-(--fail)' : ''" class="shrink-0 font-semibold">{{
                  statusText(call.status)
                }}</span>
                <span class="shrink-0 text-(--ink-soft)">{{ call.ms }} ms</span>
              </button>
              <div
                v-if="openCall?.call === call"
                class="space-y-2 rounded border border-(--island-line) p-2 text-xs"
              >
                <p class="font-mono break-all">{{ call.method }} {{ call.url }}</p>
                <p v-if="!openCall.data" class="text-(--ink-soft)">
                  {{ call.body ? 'Loading…' : 'No bodies were kept for this call.' }}
                </p>
                <template v-else>
                  <p class="font-semibold">Request</p>
                  <pre
                    v-if="pretty(openCall.data.request.body)"
                    class="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono"
                    >{{ pretty(openCall.data.request.body) }}</pre>
                  <p v-else class="text-(--ink-soft)">No body</p>
                  <p class="font-semibold">Response</p>
                  <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">{{
                    pretty(openCall.data.response.body) || 'No body'
                  }}</pre>
                </template>
              </div>
            </template>
          </div>
          <div
            v-if="step.status === 'failed'"
            class="space-y-2 rounded-lg border border-(--fail) p-3"
          >
            <p class="font-semibold text-(--fail)">
              {{ step.check?.when === 'expect' ? 'An expectation failed' : 'It failed' }}
            </p>
            <template v-if="step.check">
              <p><span class="text-(--ink-soft)">check</span> {{ step.check.trait }}</p>
              <p v-if="step.check.wants">
                <span class="text-(--ink-soft)">wanted</span> {{ step.check.wants }}
              </p>
              <p v-if="step.check.saw">
                <span class="text-(--ink-soft)">saw</span> {{ step.check.saw }}
              </p>
              <p v-if="step.check.url" class="font-mono text-xs text-(--ink-soft)">
                {{ step.check.url }}
              </p>
            </template>
            <pre class="max-h-48 overflow-auto text-xs whitespace-pre-wrap">{{ step.error }}</pre>
          </div>
          <div v-if="step.read">
            <p class="mb-1 font-semibold">The page showed</p>
            <pre class="max-h-72 overflow-auto rounded-lg bg-(--island-line) p-2 text-xs">{{
              JSON.stringify(step.read, null, 2)
            }}</pre>
          </div>
          <div v-if="props.run.mem.length">
            <p class="mb-1 font-semibold">Mem it was given</p>
            <div v-for="m in props.run.mem" :key="m.flow" class="mb-2">
              <p class="text-xs text-(--ink-soft)">{{ m.flow }}</p>
              <pre class="max-h-40 overflow-auto rounded-lg bg-(--island-line) p-2 text-xs">{{
                JSON.stringify(m.values, null, 2)
              }}</pre>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </WorkspaceLayout>
</template>
