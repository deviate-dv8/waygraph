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

/** One line to route: its ends and the handles it leaves and enters by. */
export type RouteIn = {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  lane: number
}

const SIDE: Record<string, 'left' | 'right' | 'top' | 'bottom'> = {
  'in': 'left',
  'out-left': 'left',
  'out': 'right',
  'back': 'right',
  'up': 'top',
  'out-up': 'top',
  'down': 'bottom',
  'under': 'bottom',
}

/** Where a handle sits on a box: the middle of its side. */
export function portOf(rect: Rect, handle: string): Point {
  const side = SIDE[handle] ?? 'right'
  if (side === 'left') return { x: rect.x, y: rect.y + rect.h / 2 }
  if (side === 'right') return { x: rect.x + rect.w, y: rect.y + rect.h / 2 }
  if (side === 'top') return { x: rect.x + rect.w / 2, y: rect.y }
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h }
}

const STEP = 24

/**
 * Lines that run along the same channel (the same gap between columns, the same row between boxes) would draw over each
 * other and read as one. Each group of overlapping parallel segments is spread out, STEP apart, around where they met.
 * Works on vertices in place; a segment's two ends move together, so the lines stay square.
 */
function spread(routes: Point[][], axis: 'x' | 'y'): void {
  const other = axis === 'x' ? 'y' : 'x'
  type Seg = { route: number; at: number; lo: number; hi: number; i: number }
  const segs: Seg[] = []
  routes.forEach((points, route) => {
    for (let i = 1; i < points.length - 2; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      if (Math.abs(a[axis] - b[axis]) < 0.5 && Math.abs(a[other] - b[other]) > 0.5)
        segs.push({
          route,
          at: a[axis],
          lo: Math.min(a[other], b[other]),
          hi: Math.max(a[other], b[other]),
          i,
        })
    }
  })
  const parent = segs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]!
      const b = segs[j]!
      if (a.route !== b.route && Math.abs(a.at - b.at) < STEP * 2 && a.lo < b.hi && b.lo < a.hi)
        parent[find(i)] = find(j)
    }
  const groups = new Map<number, Seg[]>()
  segs.forEach((s, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), s]))
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const centre = group.reduce((sum, s) => sum + s.at, 0) / group.length
    group.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.route - b.route)
    group.forEach((s, k) => {
      const to = centre + (k - (group.length - 1) / 2) * STEP
      routes[s.route]![s.i]![axis] = to
      routes[s.route]![s.i + 1]![axis] = to
    })
  }
}

/**
 * Every line's path, around the pages and spread apart where lines share a channel. `rects` are the boxes by node id; a
 * top-down map is routed in a left-to-right frame (axes swapped) and swapped back.
 */
export function routeAll(
  edges: RouteIn[],
  rects: Map<string, Rect>,
  topDown: boolean
): Map<string, Point[]> {
  const flip = (p: Point): Point => (topDown ? { x: p.y, y: p.x } : p)
  const framed = new Map(
    [...rects].map(([id, r]) => [id, topDown ? { x: r.y, y: r.x, w: r.h, h: r.w } : r])
  )
  const routes: Point[][] = []
  const kept: RouteIn[] = []
  for (const e of edges) {
    const a = rects.get(e.source)
    const b = rects.get(e.target)
    if (!a || !b) continue
    const from = flip(portOf(a, e.sourceHandle))
    const to = flip(portOf(b, e.targetHandle))
    const others = [...framed]
      .filter(([id]) => id !== e.source && id !== e.target)
      .map(([, r]) => r)
    const sameSide = SIDE[e.sourceHandle] === SIDE[e.targetHandle]
    const room = 24 + (e.lane % 4) * 6
    routes.push(
      sameSide
        ? [
            from,
            { x: from.x + room, y: from.y },
            { x: from.x + room, y: to.y },
            { x: to.x + room, y: to.y },
            to,
          ].filter((p, i, all) => i === 0 || p.x !== all[i - 1]!.x || p.y !== all[i - 1]!.y)
        : routeAround(from, to, others, 24, e.lane)
    )
    kept.push(e)
  }
  spread(routes, 'x')
  spread(routes, 'y')
  return new Map(kept.map((e, i) => [e.id, routes[i]!.map(flip)]))
}
