import type { BlockStats, RunDetail } from '#types/project'

/** A url's path and its query and hash; null for a url that can't be read. */
function parts(url: string): { path: string; rest: string } | null {
  try {
    const u = new URL(url)
    return { path: u.pathname, rest: u.search + u.hash }
  } catch {
    return null
  }
}

/**
 * What the runs say about each Block: how often it ran and how it went, and what it did to the address. A step's
 * address before it is the last one an earlier step of its run ended on; a step that ends on another path navigates
 * (a submit that redirects, a click a single-page app routes); one that stays on its page but changes the query or hash
 * changes the address only (a tab or a filter kept in the url).
 */
export function blockStats(runs: RunDetail[]): Record<string, BlockStats> {
  const stats: Record<string, BlockStats> = {}
  const of = (block: string) =>
    (stats[block] ??= { runs: 0, passed: 0, failed: 0, ms: null, moves: [], addressOnly: 0 })
  const totals = new Map<string, { ms: number; n: number }>()
  for (const run of runs) {
    let before: string | null = null
    for (const step of [...run.stepsList].sort((a, b) => a.index - b.index)) {
      if (step.cleanup) continue
      const s = of(step.block)
      s.runs++
      if (step.status === 'passed') s.passed++
      if (step.status === 'failed') s.failed++
      if (step.ms !== null) {
        const t = totals.get(step.block) ?? { ms: 0, n: 0 }
        totals.set(step.block, { ms: t.ms + step.ms, n: t.n + 1 })
      }
      if (step.url) {
        const was = before ? parts(before) : null
        const now = parts(step.url)
        if (was && now && was.path !== now.path) {
          const move = s.moves.find((m) => m.from === was.path && m.to === now.path)
          if (move) move.count++
          else s.moves.push({ from: was.path, to: now.path, count: 1 })
        } else if (was && now && was.rest !== now.rest && step.from === step.to) {
          s.addressOnly++
        }
        before = step.url
      }
    }
  }
  for (const [block, t] of totals) of(block).ms = Math.round(t.ms / t.n)
  for (const s of Object.values(stats)) s.moves.sort((a, b) => b.count - a.count)
  return stats
}
