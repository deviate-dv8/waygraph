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
export const WAYGRAPH_RING_CSS =
  "#wg-ring{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "border:2.5px solid #7C3AED;border-radius:10px;" +
  // Opacity fade only - NEVER transition border-color/box-shadow. Tone swaps
  // (auto gray -> planned purple -> warning yellow) must snap instantly;
  // color transitions read as a muddy gray/purple/yellow morph on ring 2+.
  "box-shadow:0 0 0 4px rgba(124,58,237,.16);transition:opacity .3s ease;}" +
  // Planned (stubs / fixtures / YAP / instruction.highlights) = purple.
  // Automation (verify fallback, unmatched fill/click) = gray - operators
  // can ignore engine checks and watch purple + semantic tones.
  "#wg-ring[data-tone=planned]{border-color:#7C3AED;box-shadow:0 0 0 4px rgba(124,58,237,.16);}" +
  "#wg-ring[data-tone=auto]{border-color:#9CA3AF;box-shadow:0 0 0 4px rgba(156,163,175,.28);}" +
  "#wg-ring[data-tone=info]{border-color:#3B82F6;box-shadow:0 0 0 4px rgba(59,130,246,.22);}" +
  "#wg-ring[data-tone=warning]{border-color:#EAB308;box-shadow:0 0 0 4px rgba(234,179,8,.22);}" +
  "#wg-ring[data-tone=danger]{border-color:#EF4444;box-shadow:0 0 0 4px rgba(239,68,68,.22);}" +
  "#wg-ring[data-tone=success]{border-color:#22C55E;box-shadow:0 0 0 4px rgba(34,197,94,.22);}" +
  // Real, direct user request: a visible color distinction between a real
  // Playwright-driven action (auto gray, unchanged) and a pure DOM
  // inspection (this - orange).
  "#wg-ring[data-tone=orange]{border-color:#F97316;box-shadow:0 0 0 4px rgba(249,115,22,.22);}" +
  // A real element, not a ::after pseudo-element - a pseudo-element's
  // position is CSS-relative to the ring's own box (left:0 always meant
  // "the ring's own left edge"), so it had no way to be clamped back onto
  // screen when that box sat near a viewport edge - the label's text just
  // ran off, invisibly, with no overflow guard at all. A real sibling can
  // be measured (its actual rendered width) and repositioned in JS -
  // pushed back onto screen, same width, never shrunk. See
  // window.__wgPositionRing in cli.ts's own installOverlay.
  "#wg-ring-label{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "max-width:min(360px,70vw);white-space:normal;padding:6px 10px;border-radius:7px;background:#7C3AED;color:#fff;" +
  "font:600 12px/1.35 system-ui,sans-serif;transition:opacity .3s ease;}" +
  "#wg-ring-label[data-tone=planned]{background:#7C3AED;color:#fff;}" +
  "#wg-ring-label[data-tone=auto]{background:#6B7280;color:#fff;}" +
  "#wg-ring-label[data-tone=info]{background:#2563EB;color:#fff;}" +
  "#wg-ring-label[data-tone=warning]{background:#EAB308;color:#1c1917;}" +
  "#wg-ring-label[data-tone=danger]{background:#DC2626;color:#fff;}" +
  "#wg-ring-label[data-tone=success]{background:#16A34A;color:#fff;}" +
  "#wg-ring-label[data-tone=orange]{background:#EA580C;color:#fff;}" +
  // size: ring pad + label font; weight: label boldness
  "#wg-ring[data-size=sm]{border-width:1.5px;border-radius:8px;}" +
  "#wg-ring[data-size=lg]{border-width:4px;border-radius:12px;}" +
  "#wg-ring-label[data-size=sm]{font-size:10px;line-height:1.25;padding:4px 7px;border-radius:5px;}" +
  "#wg-ring-label[data-size=lg]{font-size:16px;line-height:1.35;padding:8px 14px;border-radius:9px;max-width:min(480px,85vw);}" +
  "#wg-ring-label[data-weight=bold]{font-weight:800;}" +
  "#wg-ring-label[data-weight=normal]{font-weight:600;}";
