import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'

/** How this app plays flows. The settings live in the viewer's browser: the page reads and writes them there. */
@inject()
export default class SettingsController {
  constructor(protected project: ProjectService) {}

  async show({ inertia }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    return inertia.render('settings', { project: manifest.project })
  }
}
