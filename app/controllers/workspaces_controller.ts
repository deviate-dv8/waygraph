import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'

/** The project's map: its pages (Checkpoints), the Blocks between them, what each page shows and can be expected. */
@inject()
export default class WorkspacesController {
  constructor(protected project: ProjectService) {}

  async show({ inertia, request }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest({ fresh: request.input('fresh') !== undefined })
    return inertia.render('map', {
      project: manifest.project,
      checkpoints: manifest.checkpoints,
      blocks: manifest.blocks,
      readBlocks: manifest.readBlocks,
      flows: manifest.flows.map((f) => ({
        id: f.id,
        name: f.exportName,
        file: f.file,
        steps: f.steps.length,
      })),
      skipped: manifest.skipped,
    })
  }
}
