/**
 * How a link loads its page before the click: on hover, kept 5 s as current and up to a minute as stale (shown at once
 * while it loads again), so going back and forth between pages doesn't wait on the server. `v-bind="PREFETCH"`.
 */
export const PREFETCH = { prefetch: 'hover', cacheFor: ['5s', '1m'] } as const
