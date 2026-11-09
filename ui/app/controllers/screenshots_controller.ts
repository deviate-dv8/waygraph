import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'

/** The screenshots Blocks took (`screenshot: true`): a page's newest, and one step's in a run. */
@inject()
export default class ScreenshotsController {
  constructor(protected project: ProjectService) {}

  async page({ params, response }: HttpContext) {
    const file = this.project.screenshotFile({ page: params.checkpoint })
    return file ? response.download(file) : response.notFound()
  }

  async step({ params, response }: HttpContext) {
    const file = this.project.screenshotFile({ run: params.id, file: params.file })
    return file ? response.download(file) : response.notFound()
  }
}
