import type { LastResult, RunDetail } from '#types/project'

/**
 * How each Block last went, from the newest run that played it: the dot beside a move or an expectation on a page. `runs`
 * are the runs the app has read (each flow's newest); the latest start wins.
 */
export function lastResults(runs: Iterable<RunDetail>): Record<string, LastResult> {
  const out: Record<string, LastResult & { at: number }> = {}
  for (const run of runs) {
    for (const step of run.stepsList) {
      if (step.cleanup || step.status === 'running') continue
      const seen = out[step.block]
      if (seen && seen.at >= run.startedAt) continue
      out[step.block] = {
        ok: step.status === 'passed',
        runId: run.id,
        ms: step.ms,
        at: run.startedAt,
      }
    }
  }
  return Object.fromEntries(
    Object.entries(out).map(([block, { at: _at, ...rest }]) => [block, rest])
  )
}
