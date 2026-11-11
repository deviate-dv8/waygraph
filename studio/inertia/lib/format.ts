import { formatTimeAgo } from '@vueuse/core'

/** "3 minutes ago". */
export function ago(at: number): string {
  return at ? formatTimeAgo(new Date(at)) : 'never'
}

/** "1.2 s", "340 ms". */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`
}

const plural = new Intl.PluralRules('en')

/** "1 step", "3 steps": `word` is the singular; `many` when the plural isn't just an s. */
export function count(n: number, word: string, many = `${word}s`): string {
  return `${n} ${plural.select(n) === 'one' ? word : many}`
}

/** An address as a step shows it: its path, and its host too when it isn't the site the run started on. */
export function shortUrl(url: string, home: string | undefined): string {
  try {
    const u = new URL(url)
    const path = `${u.pathname}${u.search}`
    return u.host === home || !u.host ? path : `${u.host}${path}`
  } catch {
    return url
  }
}

/** The host of an address, when it has one. */
export function hostOf(url: string | null | undefined): string | undefined {
  try {
    return url ? new URL(url).host || undefined : undefined
  } catch {
    return undefined
  }
}
