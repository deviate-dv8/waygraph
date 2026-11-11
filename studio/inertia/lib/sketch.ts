import rough from 'roughjs'
import type { Options } from 'roughjs/bin/core'

/** One SVG path of a hand-drawn shape: its outline, or its fill (hachure lines, or a solid area). */
export interface SketchPath {
  d: string
  strokeWidth: number
  part: 'outline' | 'hachure' | 'solid'
}

/**
 * rough.js writes colours into SVG attributes, where CSS variables don't apply. So it draws with these two markers,
 * and each path says which part it is; the component colours the parts through `style` (where `var(--ink)` works).
 */
export const OUTLINE = '#000001'
export const FILL = '#000002'

const generator = rough.generator()

/** A stable seed from a name: the same shape looks the same on every render (rough.js is random otherwise). */
export function seedOf(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  return (h >>> 0) % 2 ** 31 || 1
}

function paths(drawable: ReturnType<typeof generator.rectangle>): SketchPath[] {
  return generator.toPaths(drawable).map((p) => ({
    d: p.d,
    strokeWidth: p.strokeWidth,
    part: p.fill === FILL ? 'solid' : p.stroke === FILL ? 'hachure' : 'outline',
  }))
}

/** A hand-drawn rectangle `w` x `h`, inset so its wobble stays inside the box. */
export function sketchRect(w: number, h: number, options: Options): SketchPath[] {
  const inset = 3
  return paths(
    generator.rectangle(
      inset,
      inset,
      Math.max(0, w - inset * 2),
      Math.max(0, h - inset * 2),
      options
    )
  )
}

/** A hand-drawn ellipse filling `w` x `h`. */
export function sketchEllipse(w: number, h: number, options: Options): SketchPath[] {
  return paths(generator.ellipse(w / 2, h / 2, Math.max(0, w - 6), Math.max(0, h - 6), options))
}

/** A hand-drawn line along an SVG path (an edge). */
export function sketchPath(d: string, options: Options): SketchPath[] {
  return paths(generator.path(d, options))
}

/** Flowchart's terminator (start / end): a hand-drawn rectangle with round ends. */
export function sketchStadium(w: number, h: number, options: Options): SketchPath[] {
  const i = 3
  const r = Math.max(0, Math.min((h - i * 2) / 2, (w - i * 2) / 2))
  const d = `M ${i + r} ${i} L ${w - i - r} ${i} A ${r} ${r} 0 0 1 ${w - i - r} ${h - i} L ${i + r} ${h - i} A ${r} ${r} 0 0 1 ${i + r} ${i} Z`
  return paths(generator.path(d, options))
}

/** Flowchart's input / output (data in or out): a hand-drawn parallelogram. */
export function sketchParallelogram(w: number, h: number, options: Options): SketchPath[] {
  const i = 3
  const skew = Math.min(18, w * 0.12)
  return paths(
    generator.polygon(
      [
        [i + skew, i],
        [w - i, i],
        [w - i - skew, h - i],
        [i, h - i],
      ],
      options
    )
  )
}

/** Flowchart's predefined process (a named sub-process): a hand-drawn rectangle with a bar inside each side. */
export function sketchSubroutine(w: number, h: number, options: Options): SketchPath[] {
  const i = 3
  const bar = 9
  // The bars are lines: no fill of their own.
  const lineOptions: Options = { ...options }
  delete lineOptions.fill
  return [
    ...sketchRect(w, h, options),
    ...paths(generator.line(i + bar, i, i + bar, h - i, lineOptions)),
    ...paths(generator.line(w - i - bar, i, w - i - bar, h - i, lineOptions)),
  ]
}
