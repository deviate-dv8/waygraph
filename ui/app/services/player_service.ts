import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { ProjectService, waygraphCommand } from '#services/project_service'
import type { Play, PlayMode } from '#types/project'

/** What this app set for itself from its own `.env`: not the project's to see. */
const APP_ENV = [
  'PORT',
  'HOST',
  'NODE_ENV',
  'APP_KEY',
  'APP_URL',
  'LOG_LEVEL',
  'SESSION_DRIVER',
  'TZ',
  'WAYGRAPH_PROJECT_DIR',
]
/** The lines of output kept: enough to see why a run never started. */
const OUTPUT_LINES = 200

type Job = Play & { child: ChildProcess; finding: NodeJS.Timeout | null }

/**
 * Plays a flow of the project through its own waygraph (`waygraph run` or `waygraph demo`), one at a time. The run
 * writes its log like any other, so the run's page follows it there; this keeps the process and what it printed.
 */
export class PlayerService {
  private static job: Job | null = null

  /** The play in progress, or the last one, without its process. */
  get current(): Play | null {
    const job = PlayerService.job
    if (!job) return null
    const { flow, mode, command, startedAt, runId, exitCode, output } = job
    return { flow, mode, command, startedAt, runId, exitCode, output: [...output] }
  }

  /** The id of the run playing now, once its log has started. */
  get playingRunId(): string | null {
    const job = PlayerService.job
    return job && job.exitCode === null ? job.runId : null
  }

  /** Starts `waygraph <mode> <flow>`; throws while another play is still going. */
  start(flow: string, mode: PlayMode, options: { noExpect?: boolean; replay?: string } = {}): Play {
    if (PlayerService.job && PlayerService.job.exitCode === null) {
      throw new Error(`Still playing ${PlayerService.job.flow}: stop it first.`)
    }
    const project = new ProjectService()
    const dir = project.dir
    if (!dir) throw new Error('No project is set.')
    const args = [mode, flow, dir]
    if (options.noExpect) args.push('--no-expect')
    if (options.replay) args.push('--replay', options.replay)
    const [cmd, cmdArgs] = waygraphCommand(dir, args)
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' }
    for (const key of APP_ENV) delete env[key]
    // A run plays in the background; a demo opens its browser to be watched.
    env.WAYGRAPH_HEADED = mode === 'demo' ? '1' : '0'
    // Its own process group: stopping it stops the browser it started too.
    const child = spawn(cmd, cmdArgs, {
      cwd: dir,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const startedAt = Date.now()
    const job: Job = {
      flow,
      mode,
      command: ['waygraph', ...args.slice(0, 2), ...args.slice(3)].join(' '),
      startedAt,
      runId: null,
      exitCode: null,
      output: [],
      child,
      finding: null,
    }
    PlayerService.job = job
    const keep = (chunk: Buffer) => {
      job.output.push(
        ...chunk
          .toString('utf8')
          .split('\n')
          .filter((line) => line.trim())
      )
      job.output.splice(0, Math.max(0, job.output.length - OUTPUT_LINES))
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)
    // A run log is named after the moment the run started: the first one named after this play's start is its run.
    const after = new Date(startedAt - 1000).toISOString().replace(/[:.]/g, '-')
    const folder = project.runsDir()
    job.finding = setInterval(async () => {
      if (!existsSync(folder)) return
      const names = await readdir(folder)
      const name = names.filter((n) => n.endsWith('.jsonl') && n > after).sort()[0]
      if (name && !job.runId) job.runId = name.replace(/\.jsonl$/, '')
      if (job.runId && job.finding) clearInterval(job.finding)
    }, 250)
    child.on('exit', (code, signal) => {
      job.exitCode = code ?? (signal ? 130 : 1)
      // The log may be written just before the process ends: one last look, then stop looking.
      setTimeout(() => job.finding && clearInterval(job.finding), 500)
    })
    child.on('error', (error) => {
      job.output.push(String(error))
      job.exitCode = 1
    })
    return this.current as Play
  }

  /** Stops the play in progress, and everything it started. */
  stop(): void {
    const job = PlayerService.job
    if (!job || job.exitCode !== null || !job.child.pid) return
    try {
      process.kill(-job.child.pid, 'SIGTERM')
    } catch {
      // It ended on its own in the meantime.
    }
    // What it prints while it stops doesn't matter, and its output pipes can outlive it: they'd keep this app running.
    job.child.stdout?.destroy()
    job.child.stderr?.destroy()
  }
}
