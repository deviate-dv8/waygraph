import type { Manifest, PageFlow, RunDetail } from '#types/project'

/**
 * Each page's flows: those with a step that lands on it or starts on it, with how each flow's newest run went. A Block
 * with several outcomes (signing in lands signed in, or back on the login page) lands where the next step starts; with
 * no next step to say, the flow may land on any of them, until its newest run says: where its steps landed, it lands; a
 * page it may land on but a passing run never did, it doesn't.
 */
export function pageFlows(
  manifest: Manifest,
  newest: Map<string, RunDetail>
): Record<string, PageFlow[]> {
  const blocks = new Map(manifest.blocks.map((b) => [b.name, b]))
  const pages = new Set(manifest.checkpoints)
  const byPage: Record<string, PageFlow[]> = {}
  for (const flow of manifest.flows) {
    const run = newest.get(flow.exportName)
    const reach = new Map<string, PageFlow['reach']>()
    const acts = new Set<string>()
    const mark = (tag: string, how: PageFlow['reach']) => {
      const had = reach.get(tag)
      if (pages.has(tag) && RANK[how] > (had ? RANK[had] : -1)) reach.set(tag, how)
    }
    flow.steps.forEach((step, i) => {
      const block = blocks.get(step)
      if (!block) return
      block.from.forEach((tag) => {
        acts.add(tag)
        mark(tag, 'acts')
      })
      const next = blocks.get(flow.steps[i + 1] ?? '')
      const taken =
        block.to.length > 1 && next && !next.from.includes('*')
          ? block.to.filter((tag) => next.from.includes(tag))
          : []
      if (block.to.length === 1 || taken.length)
        (taken.length ? taken : block.to).forEach((tag) => mark(tag, 'lands'))
      else block.to.forEach((tag) => mark(tag, 'may land'))
    })
    if (run) {
      const landed = new Set(run.stepsList.flatMap((step) => step.to ?? []))
      for (const [tag, how] of reach) {
        if (how !== 'may land' || run.ok !== true || landed.has(tag)) continue
        if (acts.has(tag)) reach.set(tag, 'acts')
        else reach.delete(tag)
      }
      landed.forEach((tag) => mark(tag, 'lands'))
    }
    for (const [tag, how] of reach) {
      ;(byPage[tag] ??= []).push({
        name: flow.exportName,
        reach: how,
        ok: run?.ok ?? null,
        runId: run?.id ?? null,
      })
    }
  }
  return byPage
}

/** Which of a flow's ways to a page wins: landing there over maybe landing over only acting there. */
const RANK: Record<PageFlow['reach'], number> = { 'acts': 0, 'may land': 1, 'lands': 2 }
