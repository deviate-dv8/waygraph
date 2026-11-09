import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ProjectService } from '#services/project_service'
import { blockStats } from '#services/block_stats'
import type { Json, RunDetail } from '#types/project'

/** How many of the newest runs the Blocks page reads for each Block's stats. */
const RUNS = 150

/** Every Block of the project, its Read Blocks and the mem keys they need, with what the runs say about each. */
@inject()
export default class BlocksController {
  constructor(protected project: ProjectService) {}

  async index({ inertia }: HttpContext) {
    if (!this.project.dir) return inertia.render('setup', { project: null })
    const manifest = await this.project.manifest()
    const newest = await this.project.runs(RUNS)
    const details = await Promise.all(newest.map((r) => this.project.run(r.id)))
    const runs = details.filter((r): r is RunDetail => r !== null)
    // The flows that play each Block, as a step or as an expectation of one.
    const usedBy: Record<string, string[]> = {}
    for (const flow of manifest.flows) {
      for (const name of new Set([...flow.steps, ...flow.stepExpects.flat()])) {
        ;(usedBy[name] ??= []).push(flow.exportName)
      }
    }
    // Each key a Block requires, who requires it, and the value the newest run that had it was seeded with.
    const requiredBy = new Map<string, string[]>()
    for (const b of manifest.blocks)
      for (const key of b.requires) requiredBy.set(key, [...(requiredBy.get(key) ?? []), b.name])
    const seen = new Map<string, Json>()
    for (const run of runs) {
      for (const segment of run.mem)
        for (const [key, value] of Object.entries(segment.values))
          if (!seen.has(key)) seen.set(key, value)
    }
    return inertia.render('blocks/index', {
      project: manifest.project,
      blocks: manifest.blocks,
      readBlocks: manifest.readBlocks,
      usedBy,
      stats: blockStats(runs),
      runsRead: runs.length,
      mem: [...requiredBy]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, blocks]) => ({ key, requiredBy: blocks, example: seen.get(key) ?? null })),
    })
  }
}
