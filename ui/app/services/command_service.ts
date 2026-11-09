import { spawn, type ChildProcess } from 'node:child_process'
import { ProjectService, waygraphCommand } from '#services/project_service'
import { APP_ENV } from '#services/player_service'
import type { CommandJob, CommandSpec } from '#types/project'

/** The lines of output kept. */
const OUTPUT_LINES = 2000
/** How long stopping waits for it to end. */
const STOP_WAIT_MS = 5000

/** The project's own `waygraph` commands the Project page runs: one-shot ones, by name. */
export const COMMANDS: Record<string, CommandSpec & { args: string[] }> = {
  'check': {
    group: 'Check',
    label: 'check',
    help: 'Navigation outside Nav Blocks, inline selectors, bad practices, constant test data, orphans, pages no Read Block reads',
    args: ['check', '.'],
  },
  'validate': {
    group: 'Check',
    label: 'validate',
    help: 'Every Block and flow file loads',
    args: ['validate', '.'],
  },
  'typecheck': {
    group: 'Check',
    label: 'typecheck',
    help: 'TypeScript: every flow goes between pages its Blocks allow',
    args: ['typecheck', '.'],
  },
  'map': {
    group: 'Check',
    label: 'map',
    help: 'The src/map/ folders follow the convention',
    args: ['map', '.'],
  },
  'graph': {
    group: 'Inspect',
    label: 'graph',
    help: 'Pages, Blocks between them, skipped files and orphans, as counts and edges',
    args: ['graph', '.'],
  },
  'list': {
    group: 'Inspect',
    label: 'list',
    help: 'Every file and what it exports',
    args: ['list', '.'],
  },
  'nav': {
    group: 'Inspect',
    label: 'nav',
    help: 'Every Nav Block and where it goes',
    args: ['nav', '.'],
  },
  'manifest': {
    group: 'Inspect',
    label: 'manifest',
    help: 'What the project defines, as JSON (what this app reads)',
    args: ['manifest', '.'],
  },
  'test-flows': {
    group: 'Test',
    label: 'test --flows',
    help: 'Every flow as a Playwright test, headless',
    args: ['test', '--flows'],
  },
  'test': {
    group: 'Test',
    label: 'test',
    help: "The project's Playwright specs, headless",
    args: ['test'],
  },
  'upgrade': {
    group: 'Upgrade',
    label: 'upgrade',
    help: 'Compare the project with the scaffold of this waygraph (a dry run: nothing changes)',
    args: ['upgrade', '.'],
  },
  'upgrade-skills': {
    group: 'Upgrade',
    label: 'upgrade --skills',
    help: "Refresh the agent skills in .agents/skills to this waygraph's",
    args: ['upgrade', '.', '--skills'],
    writes: true,
  },
  'extensions': {
    group: 'Upgrade',
    label: 'extensions install',
    help: 'Download the browser extensions the config lists',
    args: ['extensions', 'install', '.'],
  },
  ...Object.fromEntries(
    (
      [
        ['effect', 'Effect Blocks to Methods'],
        ['expect', 'Assert Blocks and .assert() steps to expectations'],
        ['checkpoints', 'tag strings to Checkpoint values'],
        ['keys', 'key() / keyGroup() to keys() namespaces'],
        ['pages', 'Blocks a Page Block names used through it'],
        ['flows', 'defineFlow to map() chains'],
        ['lands', 'MethodBlock<A, B> casts to { lands }'],
        ['ff', 'runs of { ff: true } to .ffStart() ... .ffEnd()'],
        ['chain', 'drop .start() / .end()'],
      ] as const
    ).map(([name, help]) => [
      `codemod-${name}`,
      {
        group: 'Codemods',
        label: `--codemod ${name}`,
        help,
        args: ['upgrade', '.', '--codemod', name],
        writes: true,
      },
    ])
  ),
}

type Job = CommandJob & { child: ChildProcess }

/** Runs one of {@link COMMANDS} with the project's own waygraph, one at a time, and keeps what it prints. */
export class CommandService {
  private static job: Job | null = null

  get current(): CommandJob | null {
    const job = CommandService.job
    if (!job) return null
    const { name, command, startedAt, endedAt, exitCode, stopped, output } = job
    return { name, command, startedAt, endedAt, exitCode, stopped, output: [...output] }
  }

  /** Starts a command; throws while another is still running. */
  start(name: string): CommandJob {
    const spec = COMMANDS[name]
    if (!spec) throw new Error(`No command named ${name}`)
    if (CommandService.job && CommandService.job.exitCode === null) {
      throw new Error(`Still running ${CommandService.job.command}: stop it first.`)
    }
    const dir = new ProjectService().dir
    if (!dir) throw new Error('No project is set.')
    const [cmd, args] = waygraphCommand(dir, spec.args)
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', WAYGRAPH_HEADED: '0' }
    for (const key of APP_ENV) delete env[key]
    // Its own process group: stopping it stops what it started (a test run's browsers) too.
    const child = spawn(cmd, args, {
      cwd: dir,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const job: Job = {
      name,
      command: ['waygraph', ...spec.args].join(' '),
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      stopped: false,
      output: [],
      child,
    }
    CommandService.job = job
    const keep = (chunk: Buffer) => {
      job.output.push(...chunk.toString('utf8').replace(/\n$/, '').split('\n'))
      job.output.splice(0, Math.max(0, job.output.length - OUTPUT_LINES))
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)
    child.on('exit', (code, signal) => {
      job.exitCode = code ?? (signal ? 130 : 1)
      job.endedAt = Date.now()
    })
    child.on('error', (error) => {
      job.output.push(String(error))
      job.exitCode = 1
      job.endedAt = Date.now()
    })
    return this.current as CommandJob
  }

  /** Stops the command running, and what it started; resolves once it ended (or a few seconds passed). */
  async stop(): Promise<void> {
    const job = CommandService.job
    if (!job || job.exitCode !== null || !job.child.pid) return
    job.stopped = true
    const ended = new Promise<void>((resolve) => {
      job.child.once('exit', () => resolve())
      setTimeout(resolve, STOP_WAIT_MS).unref()
    })
    try {
      process.kill(-job.child.pid, 'SIGTERM')
    } catch {
      // It ended on its own in the meantime.
    }
    await ended
  }
}
