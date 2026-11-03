import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import env from '#start/env'
import type { Json, Manifest, RunDetail, RunStep, RunSummary } from '#types/project'

const run = promisify(execFile)

type RunEvent = { type: string; [k: string]: unknown }

/** How long a manifest is reused before it's read again (reading imports every project file). */
const MANIFEST_TTL_MS = 30_000

/**
 * The waygraph project this UI shows: `WAYGRAPH_PROJECT`. It reads what the project's own waygraph reports (its
 * manifest) and the run logs it wrote; it never changes the project.
 */
export class ProjectService {
  private static cached: { at: number; manifest: Manifest } | null = null

  /** The project folder, or null when `WAYGRAPH_PROJECT` is unset or isn't a folder. */
  get dir(): string | null {
    const dir = env.get('WAYGRAPH_PROJECT')
    return dir && existsSync(dir) ? resolve(dir) : null
  }

  /** The project's manifest, through its own installed waygraph so the versions always match. */
  async manifest(options: { fresh?: boolean } = {}): Promise<Manifest> {
    const dir = this.requireDir()
    const cached = ProjectService.cached
    if (
      !options.fresh &&
      cached &&
      cached.manifest.project.dir === dir &&
      Date.now() - cached.at < MANIFEST_TTL_MS
    ) {
      return cached.manifest
    }
    const bin = join(dir, 'node_modules', '.bin', 'waygraph')
    const [cmd, args] = existsSync(bin)
      ? [bin, ['manifest', dir]]
      : ['npx', ['--no-install', 'waygraph', 'manifest', dir]]
    const { stdout } = await run(cmd, args, {
      cwd: dir,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    })
    const manifest = JSON.parse(stdout) as Manifest
    ProjectService.cached = { at: Date.now(), manifest }
    return manifest
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
      files.map(async (f) => summarize(basename(f, '.jsonl'), await readEvents(join(folder, f))))
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
    const events = await readEvents(file)
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

  private requireDir(): string {
    const dir = this.dir
    if (!dir) {
      throw new Error(
        'Set WAYGRAPH_PROJECT to a waygraph project folder (it has a waygraph config and src/).'
      )
    }
    return dir
  }

  private runsDir(): string {
    return join(this.requireDir(), '.waygraph', 'runs')
  }
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
  }
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
        error: null,
        check: null,
        read: null,
        cleanup: e.cleanup === true,
      })
      continue
    }
    const step = [...steps]
      .reverse()
      .find((s) => s.index === Number(e.index) && s.block === String(e.block))
    if (!step) continue
    if (e.type === 'step:end')
      Object.assign(step, { to: String(e.to), ms: Number(e.ms), status: 'passed' })
    if (e.type === 'step:error') {
      Object.assign(step, {
        ms: Number(e.ms),
        status: 'failed',
        error: String(e.error),
        check: (e.check ?? null) as RunStep['check'],
      })
    }
    if (e.type === 'step:read') step.read = (e.read ?? null) as Record<string, Json> | null
  }
  return steps
}
