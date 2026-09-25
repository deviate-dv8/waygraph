// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { HighlightSize, HighlightStyleDefaults, HighlightTone, HighlightWeight } from "./types.js";

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


/** Map author aliases (`error` -> danger) to a canonical tone. */
export function normalizeHighlightTone(raw: unknown): HighlightTone {
  if (typeof raw !== "string") return "planned";
  const t = raw.trim().toLowerCase();
  if (t === "auto" || t === "automation" || t === "engine") return "auto";
  if (t === "info" || t === "blue") return "info";
  if (t === "warning" || t === "warn" || t === "yellow") return "warning";
  if (t === "danger" || t === "error" || t === "red") return "danger";
  if (t === "success" || t === "ok" || t === "green") return "success";
  if (t === "orange" || t === "amber" || t === "dom" || t === "inspect") return "orange";
  if (t === "planned" || t === "purple" || t === "authored") return "planned";
  return "planned";
}


/** Map size aliases to sm/md/lg. */
export function normalizeHighlightSize(raw: unknown): HighlightSize {
  if (typeof raw !== "string") return "md";
  const t = raw.trim().toLowerCase();
  if (t === "sm" || t === "s" || t === "small" || t === "tiny") return "sm";
  if (t === "lg" || t === "l" || t === "large" || t === "big" || t === "xl") return "lg";
  return "md";
}


/** Map weight aliases to normal/bold. */
export function normalizeHighlightWeight(raw: unknown): HighlightWeight {
  if (typeof raw !== "string") return "normal";
  const t = raw.trim().toLowerCase();
  if (t === "bold" || t === "strong" || t === "heavy" || t === "b") return "bold";
  return "normal";
}


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
