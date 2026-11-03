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
  project: { name: string; dir: string; waygraph: string }
  checkpoints: string[]
  blocks: ManifestBlock[]
  readBlocks: ManifestReadBlock[]
  flows: ManifestFlow[]
  skipped: { file: string; error: string }[]
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
  error: string | null
  check: { trait: string; wants?: string; saw?: string; when?: string; url?: string } | null
  read: Record<string, Json> | null
  cleanup: boolean
}

export type RunDetail = RunSummary & {
  stepsList: RunStep[]
  mem: { flow: string; values: Record<string, Json> }[]
  artifacts: { kind: string; path: string }[]
}
