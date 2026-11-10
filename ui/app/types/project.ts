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
  /** The lines of `file` that define it; missing before waygraph 0.16.19 (so are `checks` and `selectors`). */
  source?: SourceSpan
  /** What it checks before acting and on arrival; `"dynamic"`: a function builds the checks. */
  checks?: { precondition: ManifestCheck[] | 'dynamic'; verify: ManifestCheck[] | 'dynamic' }
  /** The selector entries its definition reads. */
  selectors?: SelectorEntry[]
}

/** The lines a definition spans in its file (1-based, inclusive). */
export type SourceSpan = { line: number; endLine: number }

/** A Trait as the manifest lists it. */
export type ManifestCheck = { name: string; wants?: string; selector?: string }

/** One entry of a selector file (`LoginSel.submit`): its selector, or the code that builds one. */
export type SelectorEntry = {
  name: string
  selector: string
  literal: boolean
  file: string
  line: number
}

/** Lines of a project file, from `from`. */
export type SourceLines = { file: string; from: number; lines: string[] }

export type ManifestFlow = {
  id: string
  exportName: string
  file: string
  useCase: { path: string[]; outcome: string }
  source?: SourceSpan
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
  source?: SourceSpan
}

/** What `waygraph manifest` prints: everything a project defines, without running it. */
export type Manifest = {
  version: number
  project: { name: string; dir: string; waygraph: string; baseUrl?: string }
  /** The config file and what it resolves to (a function shows as a word); missing before waygraph 0.16.18. */
  config?: { file: string; values: Json }
  checkpoints: string[]
  /** The addresses each page is known by (its Navs' urls, the urls its Blocks verify); missing before waygraph 0.16.16. */
  pageUrls?: Record<string, string[]>
  blocks: ManifestBlock[]
  readBlocks: ManifestReadBlock[]
  flows: ManifestFlow[]
  /** Every entry of the project's selector files; missing before waygraph 0.16.19. */
  selectors?: SelectorEntry[]
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

/** A flow as the Flows page lists it: what a row shows, nothing more (a project can have hundreds). */
export type FlowRow = {
  id: string
  name: string
  file: string
  group: string
  steps: number
  expectations: number
  /** Every step's name, to find a flow by a step. */
  stepNames: string
  lastRun: { id: string; ok: boolean | null; startedAt: number } | null
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

/** Playwright's UI mode over the project's flows: where it listens once it started, and what it printed. */
export type PlaywrightUi = {
  url: string | null
  /** Null while it runs. */
  exitCode: number | null
  output: string[]
  /** The one flow it shows (a flow's page opened it), or null for every flow. */
  flow: string | null
}

/** A move between pages on the map: one per (from, to) pair, with every Block that makes it. */
export type MapEdge = {
  id: string
  source: string
  target: string
  blocks: ManifestBlock[]
}

/** A site the project's pages live on: its origin and how the map names it. */
export type Site = {
  id: string
  origin: string
  label: string
}

/** A path segment on the way to pages that's no page of its own: `/platform`, holding `/platform/plant`, `/platform/lines`... */
export type Folder = {
  id: string
  origin: string
  /** Its full path on its site. */
  path: string
  /** Its path past the folder or site it hangs from: `plant/` under `/platform`. */
  label: string
}

/** Where each page sits in its site, and the dashed edges that hang it there. */
export type SiteMap = {
  sites: Site[]
  folders: Folder[]
  /** Each page's address (its first known one) as it reads on the map: a path on its site. */
  paths: Record<string, string>
  edges: (MapEdge & { site: true })[]
}

/** What a Block's runs say: how often it ran and how, and what it did to the address. */
export type BlockStats = {
  runs: number
  passed: number
  failed: number
  /** Its mean time, in ms. */
  ms: number | null
  /** The paths it went from and to, when its step ended on another path than the page it started on. */
  moves: { from: string; to: string; count: number }[]
  /** How often it stayed on its page but changed the address (the query or hash: a tab, a filter). */
  addressOnly: number
}

/** One of the project's waygraph commands, as the Project page offers it. */
export type CommandSpec = {
  group: string
  label: string
  help: string
  /** It changes the project's files: asked before it runs. */
  writes?: boolean
}

/** A command run from the Project page: what it is, and what it printed. */
export type CommandJob = {
  name: string
  command: string
  startedAt: number
  endedAt: number | null
  /** Null while it runs. */
  exitCode: number | null
  /** Ended by Stop: its exit code doesn't say how it went. */
  stopped: boolean
  output: string[]
}
