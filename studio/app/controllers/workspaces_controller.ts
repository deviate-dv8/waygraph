import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'
import { flowOfRun, pageFlows } from '#services/page_flows'
import { siteMap, siteMapFrom } from '#services/site_map'
import { mapAccess } from '#services/layouts'
import { lastResults } from '#services/results'
import { pageNetwork } from '#services/page_network'
import type { Manifest, RunDetail } from '#types/project'

/** waygraph's Start Checkpoint, as the manifest names it. */
const START = '__start__'

/** The project's map: its pages (Checkpoints), the Blocks between them, what each page shows and can be expected. */
@inject()
export default class WorkspacesController {
  constructor(protected project: ProjectService) {}

  async show({ inertia, request }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest({ fresh: request.input('fresh') !== undefined })
    // waygraph's Start is where a flow begins, before its first page: not a page on the map.
    const pages = manifest.checkpoints.filter((tag) => tag !== START)
    // The pages in the order the project's flows reach them: the journey a site map's rows follow.
    const landsOn = new Map(manifest.blocks.map((b) => [b.name, b.to]))
    const journey = [
      ...new Set(manifest.flows.flatMap((f) => f.steps.flatMap((step) => landsOn.get(step) ?? []))),
    ].filter((tag) => tag !== '*')
    // The map as one account sees it (`?as=planner`): only what it's given.
    const { blocks, access } = mapAccess(
      request.input('as') ?? null,
      manifest.blocks,
      manifest.layouts ?? [],
      manifest.accounts
    )
    const closed = new Set(access.closed)
    const newest = await this.newestRuns(manifest.flows)
    return inertia.render('map', {
      project: manifest.project,
      checkpoints: pages.filter((tag) => !closed.has(tag)),
      blocks,
      readBlocks: manifest.readBlocks,
      pages: (manifest.pages ?? []).filter((p) => !p.checkpoint || !closed.has(p.checkpoint)),
      results: lastResults(newest.values()),
      access,
      pageUrls: manifest.pageUrls ?? {},
      site: manifest.siteTree
        ? siteMapFrom(manifest.siteTree, manifest.blocks)
        : siteMap(pages, manifest.pageUrls ?? {}, manifest.project.baseUrl, manifest.blocks),
      journey,
      pageFlows: pageFlows(manifest, newest),
      network: pageNetwork(newest.values()),
      states: manifest.states ?? [],
      live: await this.project.liveSessions(),
      shots: await this.project.pageShots(),
      flows: manifest.flows.map((f) => ({
        id: f.id,
        name: f.exportName,
        file: f.file,
        steps: f.steps.length,
        labels: f.labels ?? [],
        stepNames: f.steps,
      })),
      skipped: manifest.skipped,
    })
  }

  /** Each flow's newest run of it alone, step by step (where each step landed). */
  private async newestRuns(flows: Manifest['flows']): Promise<Map<string, RunDetail>> {
    const newest = new Map<string, RunDetail>()
    // Runs come newest first: the first of a flow alone is its newest. One with no flow named (a test) is matched by
    // its steps.
    for (const run of await this.project.runs()) {
      if (run.flows.length > 1 || newest.size === flows.length) continue
      if (run.flows.length === 1 && newest.has(run.flows[0])) continue
      const detail = await this.project.run(run.id)
      const flow = detail && flowOfRun(detail, flows)
      if (detail && flow && !newest.has(flow)) newest.set(flow, detail)
    }
    return newest
  }
}
