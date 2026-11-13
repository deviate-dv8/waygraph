import type { PageNetwork, RunDetail } from '#types/project'

/** Over this a call is slow, or an answer large (the same limits `waygraph check --network` uses). */
const SLOW_MS = 1000
const LARGE_BYTES = 100_000
const N_PLUS_ONE = 5

/**
 * What each page's calls look like in the flows' newest runs: per route, how many calls a step made, how long they took,
 * how they answered; and the findings `waygraph check --network` would give (the same GET twice, one route with many ids,
 * slow, large, failed). A page is where the step that made the calls landed.
 */
export function pageNetwork(newest: Iterable<RunDetail>): Record<string, PageNetwork> {
  const pages: Record<string, PageNetwork> = {}
  for (const run of newest) {
    for (const step of run.stepsList) {
      const own = step.calls.filter((c) => !c.external)
      if (!step.to || !own.length) continue
      const page = (pages[step.to] ??= { calls: [], findings: [] })
      const add = (kind: string, what: string, detail: string) => {
        if (!page.findings.some((f) => f.kind === kind && f.what === what))
          page.findings.push({ kind, what, detail })
      }
      for (const c of own) {
        const name = `${c.method} ${c.route}`
        const row = page.calls.find((r) => r.name === name)
        if (row) {
          row.count = Math.max(
            row.count,
            own.filter((o) => `${o.method} ${o.route}` === name).length
          )
          row.ms = Math.round((row.ms * row.samples + c.ms) / (row.samples + 1))
          row.samples += 1
          row.status = c.status
          row.size = c.size ?? row.size
        } else {
          page.calls.push({
            name,
            count: own.filter((o) => `${o.method} ${o.route}` === name).length,
            ms: c.ms,
            samples: 1,
            status: c.status,
            size: c.size,
          })
        }
        if (c.ms > SLOW_MS) add('slow', name, `took ${c.ms} ms`)
        if (c.size !== null && c.size > LARGE_BYTES)
          add('large', name, `${Math.round(c.size / 1024)} KB answer`)
        if (c.failed) add('failed', name, `answered ${c.status || 'nothing'}`)
      }
      const gets = own.filter((c) => c.method === 'GET')
      const urls = new Map<string, number>()
      for (const c of gets) urls.set(c.url, (urls.get(c.url) ?? 0) + 1)
      for (const [url, n] of urls)
        if (n > 1)
          add(
            'duplicate',
            `GET ${gets.find((c) => c.url === url)?.route}`,
            `asked ${n} times in one step`
          )
      const routes = new Map<string, Set<string>>()
      for (const c of gets) routes.set(c.route, (routes.get(c.route) ?? new Set()).add(c.url))
      for (const [route, set] of routes)
        if (set.size >= N_PLUS_ONE && route.includes(':id'))
          add(
            'n+1',
            `GET ${route}`,
            `${set.size} calls with different ids: one call for the list would do`
          )
    }
  }
  return pages
}
