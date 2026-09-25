import { ringCss } from "../ui/components/ring.js";
// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.

/**
 * The `#wg-ring` / `#wg-ring-label` CSS (tone/size/weight variants) - the
 * actual visual language `cli.ts`'s own demo stepper paints with. Extracted
 * here (not left as a private `cli.ts` constant) so anything else wanting the
 * SAME "waygraph vision" ring can import pure CSS text, not the rendering
 * engine around it - `cli.ts` runs `main().catch(...)` unconditionally at
 * module load with no `import.meta.url` guard, so importing anything from it
 * is unsafe as a library dependency (see `pilot-overlay.ts`'s own doc
 * comment for the same reasoning re: the badge/panel). This file has always
 * been the pure, side-effect-free home for tone/size/weight - the CSS that
 * renders them belongs alongside it for the same reason. `cli.ts` imports
 * this constant instead of keeping its own duplicate copy.
 */
export const WAYGRAPH_RING_CSS = ringCss();
