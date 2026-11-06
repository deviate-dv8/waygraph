import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'

/** The flows: the catalogue, and one flow as its steps with what each expects and its recent runs. */
@inject()
export default class FlowsController {
  constructor(protected project: ProjectService) {}

  async index({ inertia }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    const runs = await this.project.runs()
    return inertia.render('flows/index', {
      project: manifest.project,
      flows: manifest.flows.map((f) => {
        const last = runs.find((r) => r.flows.includes(f.exportName))
        return { ...f, lastRun: last ?? null }
      }),
    })
  }

  async show({ inertia, params, response }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    const flow = manifest.flows.find((f) => f.exportName === params.name)
    if (!flow) return response.notFound(`No flow named ${params.name}`)
    const byName = new Map(manifest.blocks.map((b) => [b.name, b]))
    const allRuns = await this.project.runs()
    const runs = allRuns.filter((r) => r.flows.includes(flow.exportName)).slice(0, 20)
    return inertia.render('flows/show', {
      project: manifest.project,
      flow,
      steps: flow.steps.map((name, i) => ({
        name,
        block: byName.get(name) ?? null,
        expects: flow.stepExpects[i] ?? [],
      })),
      runs,
    })
  }
}
