import { setTimeout as sleep } from 'node:timers/promises'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'
import { PlayerService } from '#services/player_service'
import { playValidator } from '#validators/play'

/** How long starting a play waits for its run to begin before going back to the page it came from. */
const WAIT_FOR_RUN_MS = 8000

/** Plays a flow from the UI, and stops it. */
@inject()
export default class PlaysController {
  constructor(
    protected project: ProjectService,
    protected player: PlayerService
  ) {}

  /** Starts the flow and opens its run once its log begins; a play that takes longer shows on every page. */
  async store({ request, response, session }: HttpContext) {
    const { flow, mode, noExpect, replay } = await request.validateUsing(playValidator)
    const manifest = await this.project.manifest()
    if (!manifest.flows.some((f) => f.exportName === flow)) {
      return response.notFound(`No flow named ${flow}`)
    }
    try {
      this.player.start(flow, mode, { noExpect, replay })
    } catch (error) {
      session.flash('error', (error as Error).message)
      return response.redirect().back()
    }
    const until = Date.now() + WAIT_FOR_RUN_MS
    while (Date.now() < until) {
      const play = this.player.current
      if (play?.runId) return response.redirect().toRoute('runs.show', { id: play.runId })
      if (play?.exitCode !== null) break
      await sleep(200)
    }
    return response.redirect().back()
  }

  async destroy({ response }: HttpContext) {
    this.player.stop()
    return response.redirect().back()
  }
}
