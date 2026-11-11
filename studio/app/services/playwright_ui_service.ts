import { spawn, type ChildProcess } from 'node:child_process'
import { ProjectService, waygraphCommand } from '#services/project_service'
import { APP_ENV } from '#services/player_service'
import type { PlaywrightUi } from '#types/project'

/** How long stopping waits for it to end. */
const STOP_WAIT_MS = 5000
/** The lines of output kept: enough to see why it didn't start. */
const OUTPUT_LINES = 200

type Server = PlaywrightUi & { child: ChildProcess }

/**
 * Playwright's UI mode over the project's flows (`waygraph test --flows --ui-port`), served on a free port of this machine
 * so the app can show it in a frame. One at a time; it runs until it's stopped, or the app stops.
 */
export class PlaywrightUiService {
  private static server: Server | null = null

  /** The server running now, or the last one, without its process. */
  get current(): PlaywrightUi | null {
    const server = PlaywrightUiService.server
    if (!server) return null
    const { url, exitCode, output, flow } = server
    return { url, exitCode, output: [...output], flow }
  }

  /**
   * Starts it over every flow, or only `flow` (a flow's test is titled `<file> › <exportName>`); one running over other
   * flows is stopped first. Resolves once it says where it listens, or it ended without.
   */
  async start(flow: string | null = null): Promise<PlaywrightUi> {
    const running = PlaywrightUiService.server
    if (running && running.exitCode === null) {
      if (running.flow === flow) return this.current as PlaywrightUi
      await this.stop()
    }
    const dir = new ProjectService().dir
    if (!dir) throw new Error('No project is set.')
    const [cmd, args] = waygraphCommand(dir, [
      'test',
      '--flows',
      ...(flow ? ['-g', `› ${flow}$`] : []),
      '--ui-port=0',
      '--ui-host=127.0.0.1',
    ])
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' }
    for (const key of APP_ENV) delete env[key]
    // Its own process group: stopping it stops the test runner and every browser it started.
    const child = spawn(cmd, args, {
      cwd: dir,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const server: Server = { url: null, exitCode: null, output: [], flow, child }
    PlaywrightUiService.server = server
    return new Promise((resolve) => {
      const done = () => resolve(this.current as PlaywrightUi)
      const keep = (chunk: Buffer) => {
        const lines = chunk
          .toString('utf8')
          .split('\n')
          .filter((line) => line.trim())
        server.output.push(...lines)
        server.output.splice(0, Math.max(0, server.output.length - OUTPUT_LINES))
        const listening = lines.map((l) => /Listening on (http\S+)/.exec(l)?.[1]).find(Boolean)
        if (listening && !server.url) {
          server.url = listening
          done()
        }
      }
      child.stdout?.on('data', keep)
      child.stderr?.on('data', keep)
      child.on('exit', (code, signal) => {
        server.exitCode = code ?? (signal ? 130 : 1)
        done()
      })
      child.on('error', (error) => {
        server.output.push(String(error))
        server.exitCode = 1
        done()
      })
    })
  }

  /** Stops it, and every browser its tests opened; resolves once it has ended (or a few seconds passed). */
  async stop(): Promise<void> {
    const server = PlaywrightUiService.server
    if (!server || server.exitCode !== null || !server.child.pid) return
    const ended = new Promise<void>((resolve) => {
      server.child.once('exit', () => resolve())
      setTimeout(resolve, STOP_WAIT_MS).unref()
    })
    try {
      process.kill(-server.child.pid, 'SIGTERM')
    } catch {
      // It ended on its own in the meantime.
    }
    server.child.stdout?.destroy()
    server.child.stderr?.destroy()
    await ended
  }
}
