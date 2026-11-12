import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import env from '#start/env'
import type { Json, Manifest, RunDetail, RunStep, RunSummary, SourceLines } from '#types/project'

const run = promisify(execFile)

type RunEvent = { type: string; [k: string]: unknown }

/**
 * How long a manifest counts as current. Older, it's still served at once while a new one is read in the background
 * (reading imports every project file, seconds on a big project): a click never waits for it.
 */
const MANIFEST_TTL_MS = 30_000

/**
 * The waygraph project Studio shows: `WAYGRAPH_PROJECT_DIR`. It reads what the project's own waygraph reports (its
 * manifest) and the run logs it wrote; it never changes the project.
 */
export class ProjectService {
  private static cached: { at: number; manifest: Manifest } | null = null
  /** The manifest being read now: requests while it reads share it instead of starting another. */
  private static reading: Promise<Manifest> | null = null
  /** Each run log's events as last parsed, kept while the file's size and time are the same. */
  private static logs = new Map<string, { size: number; mtimeMs: number; events: RunEvent[] }>()

  /** The project folder, or null when `WAYGRAPH_PROJECT_DIR` is unset or isn't a folder. */
  get dir(): string | null {
    const dir = env.get('WAYGRAPH_PROJECT_DIR')
    return dir && existsSync(dir) ? resolve(dir) : null
  }

  /**
   * The project's manifest, through its own installed waygraph so the versions always match. A stale one is served
   * while a new one is read; `fresh` waits for a new one.
   */
  async manifest(options: { fresh?: boolean } = {}): Promise<Manifest> {
    const dir = this.requireDir()
    const cached = ProjectService.cached
    const current = cached && cached.manifest.project.dir === dir ? cached : null
    if (!options.fresh && current) {
      if (Date.now() - current.at >= MANIFEST_TTL_MS)
        this.readManifest(dir).catch((err: unknown) =>
          // The page keeps the manifest it has; the next request tries again.
          console.error(`waygraph manifest: ${err instanceof Error ? err.message : String(err)}`)
        )
      return current.manifest
    }
    return this.readManifest(dir)
  }

  private readManifest(dir: string): Promise<Manifest> {
    ProjectService.reading ??= (async () => {
      try {
        const [cmd, args] = waygraphCommand(dir, ['manifest', dir])
        const { stdout } = await run(cmd, args, {
          cwd: dir,
          maxBuffer: 64 * 1024 * 1024,
          timeout: 120_000,
        })
        const manifest = JSON.parse(stdout) as Manifest
        ProjectService.cached = { at: Date.now(), manifest }
        return manifest
      } finally {
        ProjectService.reading = null
      }
    })()
    return ProjectService.reading
  }

  /**
   * Lines `from` to `to` of a file the manifest names (a Block's, a flow's, a selector file's): nothing else in the
   * project is read. Null when the manifest doesn't name it.
   */
  async source(file: string, from: number, to: number): Promise<SourceLines | null> {
    const manifest = await this.manifest()
    const named = new Set([
      ...manifest.blocks.map((b) => b.file),
      ...manifest.readBlocks.map((r) => r.file),
      ...manifest.flows.map((f) => f.file),
      ...(manifest.selectors ?? []).map((s) => s.file),
    ])
    if (!named.has(file)) return null
    const path = join(this.requireDir(), file)
    if (!existsSync(path)) return null
    const text = await readFile(path, 'utf8')
    const all = text.split('\n')
    const start = Math.max(1, from)
    return { file, from: start, lines: all.slice(start - 1, Math.max(start, to)) }
  }

  /** A run's video or trace, by its place among the run's artifacts: only a file its log names. */
  async artifact(id: string, index: number): Promise<{ kind: string; path: string } | null> {
    const detail = await this.run(id)
    const artifact = detail?.artifacts[index]
    if (!artifact || (artifact.kind !== 'video' && artifact.kind !== 'trace')) return null
    return existsSync(artifact.path) ? artifact : null
  }

  /** The newest runs first, from `.waygraph/runs/*.jsonl`. */
  async runs(limit = 200): Promise<RunSummary[]> {
    const folder = this.runsDir()
    if (!existsSync(folder)) return []
    const names = await readdir(folder)
    const files = names
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .reverse()
      .slice(0, limit)
    return Promise.all(
      files.map(async (f) => summarize(basename(f, '.jsonl'), await this.events(join(folder, f))))
    )
  }

  /** One run, step by step; null when there is no such log. */
  async run(id: string): Promise<RunDetail | null> {
    // A run id is a file name: no path separators, nothing outside the runs folder.
    if (!/^[\w.-]+$/.test(id)) return null
    const file = join(this.runsDir(), `${id}.jsonl`)
    if (!existsSync(file)) return null
    const info = await stat(file)
    if (!info.isFile()) return null
    const events = await this.events(file)
    return {
      ...summarize(id, events),
      stepsList: foldSteps(events),
      mem: events
        .filter((e) => e.type === 'run:mem')
        .map((e) => ({ flow: String(e.flow), values: (e.values ?? {}) as Record<string, Json> })),
      artifacts: events
        .filter((e) => e.type === 'run:artifact')
        .map((e) => ({ kind: String(e.kind), path: String(e.path) })),
    }
  }

  /** Each page's newest screenshot (`.waygraph/screenshots/<Checkpoint>.png`), by Checkpoint, with when it was taken. */
  async pageShots(): Promise<Record<string, number>> {
    const folder = join(this.runsDir(), '..', 'screenshots')
    if (!existsSync(folder)) return {}
    const names = await readdir(folder)
    const shots = await Promise.all(
      names
        .filter((n) => n.endsWith('.png'))
        .map(async (n) => {
          const info = await stat(join(folder, n))
          return [basename(n, '.png'), info.mtimeMs] as const
        })
    )
    return Object.fromEntries(shots)
  }

  /**
   * The path of a screenshot to send: a page's newest (`page`), or one step's in a run (`run`). Null for any name that
   * isn't a plain file name, or a file that isn't there: nothing outside these folders is ever read.
   */
  screenshotFile(where: { page: string } | { run: string; file: string }): string | null {
    const plain = (name: string) => /^[\w.-]+$/.test(name)
    const path =
      'page' in where
        ? plain(where.page) && join(this.runsDir(), '..', 'screenshots', `${where.page}.png`)
        : plain(where.run) &&
          plain(where.file) &&
          where.file.endsWith('.png') &&
          join(this.runsDir(), where.run, where.file)
    return path && existsSync(path) ? path : null
  }

  /** The request and response of a call (`calls/<step>-<n>.json` in the run's folder). */
  callFile(runId: string, file: string): string | null {
    const plain = (name: string) => /^[\w.-]+$/.test(name)
    if (!plain(runId) || !plain(file) || !file.endsWith('.json')) return null
    const path = join(this.runsDir(), runId, 'calls', file)
    return existsSync(path) ? path : null
  }

  /** A run log's events, parsed again only when the file changed (a run still playing grows). */
  private async events(file: string): Promise<RunEvent[]> {
    const info = await stat(file)
    const kept = ProjectService.logs.get(file)
    if (kept && kept.size === info.size && kept.mtimeMs === info.mtimeMs) return kept.events
    const events = await readEvents(file)
    ProjectService.logs.set(file, { size: info.size, mtimeMs: info.mtimeMs, events })
    return events
  }

  private requireDir(): string {
    const dir = this.dir
    if (!dir) {
      throw new Error(
        'Set WAYGRAPH_PROJECT_DIR to a waygraph project folder (it has a waygraph config and src/).'
      )
    }
    return dir
  }

  runsDir(): string {
    return join(this.requireDir(), '.waygraph', 'runs')
  }
}

/**
 * The project's own waygraph with these arguments: the waygraph installed in its node_modules, or in a folder above
 * (a workspace hoists it there). Run with this Node, so it needs no `.bin` link or shell.
 */
export function waygraphCommand(dir: string, args: string[]): [string, string[]] {
  for (let at = resolve(dir); ; at = dirname(at)) {
    const bin = join(at, 'node_modules', 'waygraph', 'bin', 'waygraph')
    if (existsSync(bin)) return [process.execPath, [bin, ...args]]
    if (dirname(at) === at) break
  }
  throw new Error(`${dir} has no waygraph installed: run npm install there.`)
}

async function readEvents(file: string): Promise<RunEvent[]> {
  const text = await readFile(file, 'utf8')
  return text
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as RunEvent]
      } catch {
        // A run cut off mid-write leaves a partial last line: skip it.
        return []
      }
    })
}

function summarize(id: string, events: RunEvent[]): RunSummary {
  const start = events.find((e) => e.type === 'run:start')
  const end = events.find((e) => e.type === 'run:end')
  const failed = events.find((e) => e.type === 'step:error')
  const flows = [...new Set(events.filter((e) => e.type === 'run:mem').map((e) => String(e.flow)))]
  const label = typeof start?.label === 'string' ? [start.label] : []
  const starts = events.filter((e) => e.type === 'step:start' && e.cleanup !== true)
  return {
    id,
    startedAt: Number(start?.at ?? 0),
    ms: end ? Number(end.ms) : null,
    ok: end ? Boolean(end.ok) : null,
    flows: flows.length ? flows : label,
    steps: events.filter((e) => e.type === 'step:start').length,
    firstStep: starts[0] ? String(starts[0].block) : null,
    lastStep: starts.length ? String(starts[starts.length - 1]?.block) : null,
    failedAt: failed ? String(failed.block) : null,
    error: end && typeof end.error === 'string' ? end.error : failed ? String(failed.error) : null,
    videos: events
      .filter((e) => e.type === 'run:artifact')
      .flatMap((e, index) => (e.kind === 'video' ? [index] : [])),
  }
}

/** A value of a compared field, short. */
function show(value: Json | undefined): string {
  const text =
    value === undefined ? 'nothing' : typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

function foldSteps(events: RunEvent[]): RunStep[] {
  const steps: RunStep[] = []
  for (const e of events) {
    if (e.type === 'step:start') {
      steps.push({
        index: Number(e.index),
        block: String(e.block),
        kind: String(e.kind),
        from: String(e.from),
        to: null,
        ms: null,
        status: 'running',
        url: null,
        screenshot: null,
        error: null,
        check: null,
        read: null,
        cleanup: e.cleanup === true,
        parent: typeof e.parent === 'number' ? e.parent : null,
        pane: typeof e.pane === 'string' ? e.pane : null,
        diffs: [],
        calls: [],
      })
      continue
    }
    // A compared run's differences, on both sides' steps.
    if (e.type === 'compare:diff' && Array.isArray(e.indexes)) {
      const sides = (e.sides ?? []) as string[]
      for (const d of (e.diffs ?? []) as { what: string; key?: string; values: Json[] }[]) {
        const line = `${d.what === 'read' ? d.key : d.what}: ${sides[0]} ${show(d.values[0])}, ${sides[1]} ${show(d.values[1])}`
        for (const index of e.indexes as number[])
          steps.find((s) => s.index === index)?.diffs.push(line)
      }
      continue
    }
    if (e.type === 'step:call') {
      steps
        .find((s) => s.index === Number(e.index))
        ?.calls.push({
          source: e.source === 'api' ? 'api' : 'page',
          method: String(e.method),
          url: String(e.url),
          route: String(e.route),
          status: Number(e.status),
          ms: Number(e.ms),
          size: typeof e.size === 'number' ? e.size : null,
          failed: e.failed === true,
          external: e.external === true,
          body: typeof e.body === 'string' ? basename(e.body) : null,
        })
      continue
    }
    const step = [...steps]
      .reverse()
      .find((s) => s.index === Number(e.index) && s.block === String(e.block))
    if (!step) continue
    if (e.type === 'step:end') {
      Object.assign(step, {
        to: String(e.to),
        ms: Number(e.ms),
        status: 'passed',
        url: typeof e.url === 'string' ? e.url : null,
      })
    }
    if (e.type === 'step:error') {
      Object.assign(step, {
        ms: Number(e.ms),
        status: 'failed',
        error: String(e.error),
        check: (e.check ?? null) as RunStep['check'],
      })
    }
    if (e.type === 'step:read') step.read = (e.read ?? null) as Record<string, Json> | null
    if (e.type === 'run:artifact' && e.kind === 'screenshot')
      step.screenshot = basename(String(e.path))
  }
  return steps
}
