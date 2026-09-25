import { TONES, type ToneName } from "../tokens.js";

/** Travelling mouse cursor + click ripple (`#wg-cursor`, `#wg-click-pulse`). */
export function cursorCss(): string {
  const p = TONES.planned;
  const pulseTones = (["auto", "info", "warning", "danger", "success"] as ToneName[])
    .map((n) => `#wg-click-pulse[data-tone=${n}]{border-color:${TONES[n].ring};background:${TONES[n].pulse};}`)
    .join("");
  return (
    "#wg-cursor{position:fixed;z-index:2147483647;width:24px;height:24px;pointer-events:none;" +
    "left:0;top:0;opacity:0;margin:0;" +
    // Travel time is JS-driven via --wg-cursor-ms (a hardcoded duration would make speed a no-op).
    "transition:transform var(--wg-cursor-ms,600ms) cubic-bezier(.22,1,.36,1),opacity .2s ease;" +
    "filter:drop-shadow(0 2px 4px rgba(12,12,26,.4));}" +
    "#wg-click-pulse{position:fixed;z-index:2147483647;width:14px;height:14px;" +
    "margin-left:-7px;margin-top:-7px;border-radius:50%;pointer-events:none;opacity:0;" +
    `border:2px solid ${p.ring};background:${p.pulse};}` +
    pulseTones +
    "#wg-click-pulse.wg-pulse{animation:wg-pulse .5s ease-out;}" +
    "@keyframes wg-pulse{0%{opacity:.9;transform:scale(.4);}100%{opacity:0;transform:scale(2.4);}}"
  );
}
