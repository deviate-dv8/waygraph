import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'
import type { RunDetail, StepCall } from '#types/project'

/** How many of the newest runs the console reads its calls from, and how many calls it lists. */
const RUNS = 30
const LISTED = 80
/** A response body longer than this is cut. */
const MAX_BODY = 500_000

/** The API console: the calls the runs made, to send again (edited or not) from here, with the response in words. */
@inject()
export default class ApiController {
  constructor(protected project: ProjectService) {}

  async index({ inertia }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    const newest = await this.project.runs(RUNS)
    const details = await Promise.all(newest.map((r) => this.project.run(r.id)))
    const seen = new Set<string>()
    const calls: { runId: string; block: string; call: StepCall }[] = []
    for (const run of details.filter((r): r is RunDetail => r !== null)) {
      for (const step of run.stepsList)
        for (const call of step.calls) {
          const key = `${call.method} ${call.url}`
          if (call.external || seen.has(key) || calls.length >= LISTED) continue
          seen.add(key)
          calls.push({ runId: run.id, block: step.block, call })
        }
    }
    return inertia.render('api', { project: manifest.project, calls })
  }

  /** Sends the request the console built, from this server, and says how it was answered. */
  async send({ request, response }: HttpContext) {
    const { method, url, headers, body } = request.only(['method', 'url', 'headers', 'body'])
    let target: URL
    try {
      target = new URL(String(url))
    } catch {
      return response.badRequest({ error: 'That is not an address' })
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
      return response.badRequest({ error: 'Only http and https addresses' })
    const verb = String(method ?? 'GET').toUpperCase()
    const started = Date.now()
    try {
      const answer = await fetch(target, {
        method: verb,
        headers: (headers ?? {}) as Record<string, string>,
        ...(body && verb !== 'GET' && verb !== 'HEAD' ? { body: String(body) } : {}),
        signal: AbortSignal.timeout(20_000),
      })
      const text = await answer.text()
      return {
        status: answer.status,
        ms: Date.now() - started,
        headers: Object.fromEntries(answer.headers),
        body: text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text,
        cut: text.length > MAX_BODY,
      }
    } catch (error) {
      return { status: 0, ms: Date.now() - started, headers: {}, body: String(error), cut: false }
    }
  }
}
