import { TONES, type ToneName } from "../tokens.js";

/** Prefix icon for gray (auto) labels - a real inline SVG (terminal chevron), not an emoji. */
const ROBOT =
  'content:"";display:inline-block;width:12px;height:12px;margin-right:5px;vertical-align:-1px;' +
  "background-repeat:no-repeat;background-size:contain;" +
  "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M2.5 3.5l5 4.5-5 4.5M8.5 12.5h5' stroke='white' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");";

const toneNames = Object.keys(TONES) as ToneName[];

/** Tone rules for `sel[data-tone=x]{...}` from the token table. */
function toneRules(sel: string, decl: (t: (typeof TONES)[ToneName]) => string, only?: ToneName[]): string {
  return (only ?? toneNames).map((n) => `${sel}[data-tone=${n}]{${decl(TONES[n])}}`).join("");
}

/** The highlight ring + its label (`#wg-ring`, `#wg-ring-label`): tone / size / weight variants. */
export function ringCss(): string {
  const p = TONES.planned;
  return (
    "#wg-ring{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
    `border:2.5px solid ${p.ring};border-radius:10px;` +
    // Opacity fade only - NEVER transition border-color/box-shadow: tone swaps must snap.
    `box-shadow:0 0 0 4px ${p.glow};transition:opacity .3s ease;}` +
    toneRules("#wg-ring", (t) => `border-color:${t.ring};box-shadow:0 0 0 4px ${t.glow};`) +
    // A real element (not ::after) so JS can measure it and clamp it back onto the screen.
    "#wg-ring-label{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
    `max-width:min(360px,70vw);white-space:normal;padding:6px 10px;border-radius:7px;background:${p.labelBg};color:${p.labelFg};` +
    "font:600 12px/1.35 system-ui,sans-serif;transition:opacity .3s ease;}" +
    toneRules("#wg-ring-label", (t) => `background:${t.labelBg};color:${t.labelFg};`) +
    // Gray = a real Playwright-driven instruction: mark it with a robot.
    `#wg-ring-label[data-tone=auto]::before{${ROBOT}}` +
    "#wg-ring[data-size=sm]{border-width:1.5px;border-radius:8px;}" +
    "#wg-ring[data-size=lg]{border-width:4px;border-radius:12px;}" +
    "#wg-ring-label[data-size=sm]{font-size:10px;line-height:1.25;padding:4px 7px;border-radius:5px;}" +
    "#wg-ring-label[data-size=lg]{font-size:16px;line-height:1.35;padding:8px 14px;border-radius:9px;max-width:min(480px,85vw);}" +
    "#wg-ring-label[data-weight=bold]{font-weight:800;}" +
    "#wg-ring-label[data-weight=normal]{font-weight:600;}"
  );
}

// A former `pilotFxRingCss()` used to live here, generating a SECOND, byte-identical copy of
// ringCss()'s own rules under `.wg-pilot-fx-ring`/`.wg-pilot-fx-label`. Pilot's fixture rings now
// paint through the same shared primitive (`ui/css/ring.css`'s `.wg-ring-el`, `runner/inpage/core.js`'s
// `__wgPaintRingAt`) as the demo/auto singleton ring - see src/ui/css/ring.css's own header.
