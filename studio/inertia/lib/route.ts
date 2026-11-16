export type Rect = { x: number; y: number; w: number; h: number }
export type Point = { x: number; y: number }

const PAD = 8

const hitsH = (r: Rect, y: number, x1: number, x2: number) =>
  y > r.y - PAD &&
  y < r.y + r.h + PAD &&
  Math.max(x1, x2) > r.x - PAD &&
  Math.min(x1, x2) < r.x + r.w + PAD
const hitsV = (r: Rect, x: number, y1: number, y2: number) =>
  x > r.x - PAD &&
  x < r.x + r.w + PAD &&
  Math.max(y1, y2) > r.y - PAD &&
  Math.min(y1, y2) < r.y + r.h + PAD

/** The vertical channel beside `edge`, between it and the nearest page that way: midway, but never wider than `want` from the edge. */
function gapX(edge: number, dir: 1 | -1, rects: Rect[], want: number): number {
  const near = rects
    .map((r) => (dir === 1 ? r.x - edge : edge - (r.x + r.w)))
    .filter((d) => d > 4)
    .reduce((a, b) => Math.min(a, b), Infinity)
  return edge + dir * Math.min(want, Number.isFinite(near) ? near / 2 : want)
}

/**
 * A square path between two pages in different columns, kept out of every other page. It leaves the source's side that
 * faces the target, runs along the gap beside it, crosses on a row that is clear (the target's row when nothing is in
 * the way, else the gap between rows, else above or below everything), and comes in along the gap beside the target.
 * Points are in a left-to-right frame; the caller swaps axes for a top-down map.
 */
export function routeAround(
  from: Point,
  to: Point,
  rects: Rect[],
  want: number,
  lane = 0
): Point[] {
  const dir: 1 | -1 = to.x >= from.x ? 1 : -1
  const spread = (lane % 4) * 5
  const x1 = gapX(from.x, dir, rects, want) + dir * spread
  const x2 = gapX(to.x, dir === 1 ? -1 : 1, rects, want) - dir * spread
  if ((dir === 1 && x1 >= x2) || (dir === -1 && x1 <= x2)) {
    const mid = (from.x + to.x) / 2
    return [from, { x: mid, y: from.y }, { x: mid, y: to.y }, to]
  }
  const ys = rects.flatMap((r) => [r.y - PAD * 2, r.y + r.h + PAD * 2])
  const top = Math.min(...rects.map((r) => r.y), from.y, to.y) - 30
  const bottom = Math.max(...rects.map((r) => r.y + r.h), from.y, to.y) + 30
  const candidates = [to.y, from.y, ...ys, top, bottom]
  const clear = (y: number) =>
    !rects.some((r) => hitsH(r, y, x1, x2) || hitsV(r, x1, from.y, y) || hitsV(r, x2, y, to.y))
  const cost = (y: number) => Math.abs(y - from.y) + Math.abs(y - to.y)
  const best = candidates.filter(clear).sort((a, b) => cost(a) - cost(b))[0] ?? bottom
  const y = best + lane * 5
  return [from, { x: x1, y: from.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: to.y }, to]
}

/** A rounded square path through `points`. */
export function roundedPath(points: Point[], radius = 10): string {
  const out = [`M ${points[0]!.x} ${points[0]!.y}`]
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const c = points[i + 1]!
    const r = Math.min(
      radius,
      Math.hypot(b.x - a.x, b.y - a.y) / 2,
      Math.hypot(c.x - b.x, c.y - b.y) / 2
    )
    const ux = Math.sign(b.x - a.x) || 0
    const uy = Math.sign(b.y - a.y) || 0
    const vx = Math.sign(c.x - b.x) || 0
    const vy = Math.sign(c.y - b.y) || 0
    out.push(`L ${b.x - ux * r} ${b.y - uy * r} Q ${b.x} ${b.y} ${b.x + vx * r} ${b.y + vy * r}`)
  }
  const last = points[points.length - 1]!
  out.push(`L ${last.x} ${last.y}`)
  return out.join(' ')
}
