import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'

/** Run history from the project's run logs, and one run step by step. */
@inject()
export default class RunsController {
  constructor(protected project: ProjectService) {}

  async index({ inertia }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    return inertia.render('runs/index', {
      project: manifest.project,
      runs: await this.project.runs(),
    })
  }

  async show({ inertia, params, response }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const run = await this.project.run(params.id)
    if (!run) return response.notFound(`No run ${params.id}`)
    const manifest = await this.project.manifest()
    return inertia.render('runs/show', { project: manifest.project, run })
  }
}
