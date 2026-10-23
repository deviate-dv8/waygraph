import type { HighlightSize, HighlightStyleDefaults, HighlightTone, HighlightWeight } from "./types.js";
import { normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight } from "../../core/narration.js";
export { normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight };

/** Apply Flow defaults under per-slot authored values (slot wins when set). */
export function applyHighlightStyleDefaults<
  T extends { tone?: HighlightTone | string; size?: HighlightSize | string; weight?: HighlightWeight | string },
>(slot: T, defaults?: HighlightStyleDefaults | null): T & {
  tone: HighlightTone;
  size: HighlightSize;
  weight: HighlightWeight;
} {
  const tone =
    slot.tone !== undefined && slot.tone !== ""
      ? normalizeHighlightTone(slot.tone)
      : defaults?.tone !== undefined
        ? normalizeHighlightTone(defaults.tone)
        : "planned";
  const size =
    slot.size !== undefined && slot.size !== ""
      ? normalizeHighlightSize(slot.size)
      : defaults?.size !== undefined
        ? normalizeHighlightSize(defaults.size)
        : "md";
  const weight =
    slot.weight !== undefined && slot.weight !== ""
      ? normalizeHighlightWeight(slot.weight)
      : defaults?.weight !== undefined
        ? normalizeHighlightWeight(defaults.weight)
        : "normal";
  return { ...slot, tone, size, weight };
}


const TONE_ICONS: Record<HighlightTone, string> = {
  planned: "",
  auto: "",
  info: "i",
  warning: "!",
  danger: "x",
  success: "+",
  orange: "",
};








/** Prefix label with a short ASCII icon for semantic tones. */
export function toneIconPrefix(tone: HighlightTone): string {
  const icon = TONE_ICONS[tone];
  return icon ? `[${icon}] ` : "";
}


/** Caption for ring / slide UI (label|caption + optional detail/tag + tone icon). */
export function formatHighlightCaption(
  h: { label?: string; caption?: string; detail?: string; tag?: string; tone?: HighlightTone | string },
): string {
  const tone = normalizeHighlightTone(h.tone);
  const icon = toneIconPrefix(tone);
  const primary = (h.label ?? h.caption ?? "").trim();
  const tag = h.tag ? `[${h.tag}] ` : "";
  if (h.detail) return `${icon}${tag}${primary} - ${h.detail}`;
  return `${icon}${tag}${primary}`;
}
