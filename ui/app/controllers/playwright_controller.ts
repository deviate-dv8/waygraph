import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'
import { PlaywrightUiService } from '#services/playwright_ui_service'
import { playwrightValidator } from '#validators/playwright'

/** Playwright's UI mode over the project's flows, in a frame: start it, show it, stop it. */
@inject()
export default class PlaywrightController {
  constructor(
    protected project: ProjectService,
    protected playwright: PlaywrightUiService
  ) {}

  async show({ inertia }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    return inertia.render('playwright', {
      project: manifest.project,
      server: this.playwright.current,
    })
  }

  /** Starts it over every flow, or over one (`flow`, from a flow's page). */
  async store({ request, response, session }: HttpContext) {
    const { flow } = await request.validateUsing(playwrightValidator)
    if (flow) {
      const manifest = await this.project.manifest()
      if (!manifest.flows.some((f) => f.exportName === flow)) {
        return response.notFound(`No flow named ${flow}`)
      }
    }
    const server = await this.playwright.start(flow ?? null)
    if (!server.url) session.flash('error', 'Playwright UI did not start: see its output.')
    return response.redirect().toRoute('playwright.show')
  }

  async destroy({ response }: HttpContext) {
    await this.playwright.stop()
    return response.redirect().toRoute('playwright.show')
  }
}
