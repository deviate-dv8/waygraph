import { TONES, type ToneName } from "../tokens.js";

/** Prefix icon for gray (auto) labels. */
const ROBOT = 'content:"\\1F916\\00a0";';

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

/** Agent-sent pilot fixture rings/labels (`.wg-pilot-fx-ring|label`), same tones as the demo ring. */
export function pilotFxRingCss(): string {
  const p = TONES.planned;
  return (
    ".wg-pilot-fx-ring{position:fixed;z-index:2147483645;pointer-events:none;opacity:0;" +
    `border:3px solid ${p.ring};border-radius:10px;box-sizing:border-box;` +
    "transition:opacity .12s ease,left .12s,top .12s,width .12s,height .12s;}" +
    toneRules(".wg-pilot-fx-ring", (t) => `border-color:${t.ring};box-shadow:0 0 0 4px ${t.glow};`) +
    ".wg-pilot-fx-label{position:fixed;z-index:2147483645;pointer-events:none;opacity:0;" +
    "font:600 12px/1.3 ui-sans-serif,system-ui,sans-serif;padding:5px 9px;border-radius:6px;" +
    "max-width:min(360px,80vw);box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap;" +
    "overflow:hidden;text-overflow:ellipsis;transition:opacity .12s ease;}" +
    toneRules(".wg-pilot-fx-label", (t) => `background:${t.labelBg};color:${t.labelFg};`) +
    `.wg-pilot-fx-label[data-tone=auto]::before{${ROBOT}}` +
    ".wg-pilot-fx-ring[data-size=sm]{border-width:1.5px;border-radius:8px;}" +
    ".wg-pilot-fx-ring[data-size=lg]{border-width:4px;border-radius:12px;}" +
    ".wg-pilot-fx-label[data-size=sm]{font-size:10px;padding:4px 7px;}" +
    ".wg-pilot-fx-label[data-size=lg]{font-size:16px;padding:8px 14px;}" +
    ".wg-pilot-fx-label[data-weight=bold]{font-weight:800;}"
  );
}
