// What the UI reads from a waygraph project: its manifest and its run logs. Plain types, shared by the server and the
// pages (no imports, so either side can use them). Types, not interfaces, and JSON values only: Inertia page props must
// be plain JSON records.

/** Any JSON value: what a run's mem and a page's read hold. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** A Block as the manifest lists it. */
export type ManifestBlock = {
  id: string
  name: string
  exportName: string
  kind: string
  description: string
  from: string[]
  to: string[]
  requires: string[]
  expect: string[]
  file: string
  map?: string
  /** Where a Nav or Page Block goes by url (`/requests/:id` for one built from mem). */
  url?: string
}

export type ManifestFlow = {
  id: string
  exportName: string
  file: string
  useCase: { path: string[]; outcome: string }
  steps: string[]
  stepExpects: string[][]
  settings: Record<string, Json>
}

export type ManifestReadBlock = {
  id: string
  name: string
  exportName: string
  description: string
  from: string[]
  fields: Record<string, Json>
  file: string
}

/** What `waygraph manifest` prints: everything a project defines, without running it. */
export type Manifest = {
  version: number
  project: { name: string; dir: string; waygraph: string; baseUrl?: string }
  checkpoints: string[]
  /** The addresses each page is known by (its Navs' urls, the urls its Blocks verify); missing before waygraph 0.16.16. */
  pageUrls?: Record<string, string[]>
  blocks: ManifestBlock[]
  readBlocks: ManifestReadBlock[]
  flows: ManifestFlow[]
  skipped: { file: string; error: string }[]
}

/** A flow that passes through a page: how it gets there, and how the flow's newest run went. */
export type PageFlow = {
  name: string
  /**
   * `lands`: a step lands on the page; `may land`: a step with several outcomes may (its flow ends there, so nothing
   * says which); `acts`: a step only starts there (something is done on it).
   */
  reach: 'lands' | 'may land' | 'acts'
  /** Its newest run's outcome (null: it never ended); no run yet: no runId. */
  ok: boolean | null
  runId: string | null
}

/** One run, from its log, in a line. */
export type RunSummary = {
  id: string
  startedAt: number
  ms: number | null
  ok: boolean | null
  flows: string[]
  steps: number
  /** The first and last Block it played: what names a run whose log says no flow (a test). */
  firstStep: string | null
  lastStep: string | null
  failedAt: string | null
  error: string | null
}

/** One step of a run, its events folded together. */
export type RunStep = {
  index: number
  block: string
  kind: string
  from: string
  to: string | null
  ms: number | null
  status: 'passed' | 'failed' | 'running'
  /** The page's address when the step ended. */
  url: string | null
  error: string | null
  check: { trait: string; wants?: string; saw?: string; when?: string; url?: string } | null
  read: Record<string, Json> | null
  cleanup: boolean
  /** The step inside a composed Block (a fast-forward) this one is part of. */
  parent: number | null
  /** Its screenshot's file name in the run's folder, when its Block took one (`screenshot: true`). */
  screenshot: string | null
}

export type RunDetail = RunSummary & {
  stepsList: RunStep[]
  mem: { flow: string; values: Record<string, Json> }[]
  artifacts: { kind: string; path: string }[]
}

/** How a flow is played: `waygraph run` (headless) or `waygraph demo` (a browser with the step panel). */
export type PlayMode = 'run' | 'demo'

/** A flow this app started playing. */
export type Play = {
  flow: string
  mode: PlayMode
  command: string
  startedAt: number
  /** The run it's writing, once its log has started. */
  runId: string | null
  /** Null while it's still going. */
  exitCode: number | null
  output: string[]
}
