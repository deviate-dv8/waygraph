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
    // A run of one flow: each of its own steps (not a cleanup, not inside a fast-forward) is the flow's next step.
    const flow =
      run.flows.length === 1 ? manifest.flows.find((f) => f.exportName === run.flows[0]) : undefined
    let next = 0
    const expects = run.stepsList.map((s) => {
      if (!flow || s.cleanup || s.parent !== null || flow.steps[next] !== s.block) return []
      return flow.stepExpects[next++] ?? []
    })
    return inertia.render('runs/show', { project: manifest.project, run, expects })
  }

  /** A run's video or trace, shown in the page or, with `download`, saved under its run's name. */
  async call({ params, response }: HttpContext) {
    const file = this.project.callFile(params.id, params.file)
    return file ? response.download(file) : response.notFound()
  }

  async artifact({ params, request, response }: HttpContext) {
    const artifact = await this.project.artifact(params.id, Number(params.index))
    if (!artifact) return response.notFound()
    if (request.input('download') === undefined) return response.download(artifact.path)
    const extension = artifact.path.split('.').pop() ?? 'bin'
    return response.attachment(artifact.path, `${params.id}-${artifact.kind}.${extension}`)
  }
}
