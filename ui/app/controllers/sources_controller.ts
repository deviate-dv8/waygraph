import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'

/** A Block's code (or a flow's, a selector file's): the lines the manifest says define it, as JSON. */
@inject()
export default class SourcesController {
  constructor(protected project: ProjectService) {}

  async show({ request, response }: HttpContext) {
    if (!this.project.dir) return response.notFound()
    const file = String(request.input('file', ''))
    const from = Number(request.input('from', 1))
    const to = Number(request.input('to', from))
    if (!Number.isInteger(from) || !Number.isInteger(to)) return response.badRequest()
    const lines = await this.project.source(file, from, to)
    return lines ? response.json(lines) : response.notFound()
  }
}
