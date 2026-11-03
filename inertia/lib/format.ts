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
