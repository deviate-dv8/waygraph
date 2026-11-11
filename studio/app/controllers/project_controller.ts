import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'
import { COMMANDS, CommandService } from '#services/command_service'
import { commandValidator } from '#validators/command'

/** The project itself: its waygraph config (as written, and what it resolves to), and its waygraph commands. */
@inject()
export default class ProjectController {
  constructor(
    protected project: ProjectService,
    protected commands: CommandService
  ) {}

  async show({ inertia }: HttpContext) {
    const dir = this.project.dir
    if (!dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    const config = manifest.config
    const source = config ? await readFile(join(dir, config.file), 'utf8').catch(() => null) : null
    return inertia.render('project', {
      project: manifest.project,
      config: config ? { ...config, source } : null,
      commands: Object.entries(COMMANDS).map(([name, { args: _args, ...spec }]) => ({
        name,
        ...spec,
      })),
      job: this.commands.current,
    })
  }

  /** Starts a command (one at a time). */
  async store({ request, response, session }: HttpContext) {
    const { name } = await request.validateUsing(commandValidator)
    try {
      this.commands.start(name)
    } catch (error) {
      session.flash('error', (error as Error).message)
    }
    return response.redirect().toRoute('project.show')
  }

  async destroy({ response }: HttpContext) {
    await this.commands.stop()
    return response.redirect().toRoute('project.show')
  }
}
