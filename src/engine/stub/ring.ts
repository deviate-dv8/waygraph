// A ring: one highlighted element with its caption, and its tone, size and weight; slides between steps.
import { choice } from "./choice.js";

/** Shared dwell fields on stubs, fixtures, and yap slides. */
export type FixtureDurationFields = {
  /**
   * Min time this fixture stays visible before the demo advances.
   * - `true` - defaults (2000ms normal, {@link FixtureDurationFields.fastMode} or 600ms when --fast)
   * - `number` - override normal dwell ms
   * - omit / false - no authored dwell (caller keeps its default timing)
   */
  duration?: boolean | number;
  /**
   * Dwell ms when demo `--fast` / gatesFast (only when {@link duration} is set).
   * Default 600.
   */
  fastMode?: number;
};

/** One named highlight slot on a block (selector + caption). */
export interface WaygraphHighlightStub extends FixtureDurationFields {
  selector: string;
  /** Primary caption line. */
  label: string;
  /** Extra caption line (ring / slide body). */
  detail?: string;
  /** Short badge, e.g. AC / BUG / GATE / YAP. */
  tag?: string;
  /**
   * Demo ring color + icon:
   * - `planned` blue (authored narration, default)
   * - `auto` gray (engine automation / verify fallback)
   * - `info` teal · `warning` yellow · `danger` red · `success` green · `orange` orange
   */
  tone?: HighlightTone;
  /**
   * Ring padding + label font scale: `sm` | `md` (default) | `lg`.
   * Aliases: small/medium/large, s/m/l.
   */
  size?: HighlightSize;
  /**
   * Label font weight: `normal` (default) | `bold`.
   * Aliases: regular, strong.
   */
  weight?: HighlightWeight;
  /**
   * Camera zoom while this ring is up (Screen Studio style - page scales toward
   * the target / cursor). Typical `1.25` .. `2`. Cleared when the ring hides
   * unless `zoomOut: false`. Episode default: {@link StubCtx.zoom}.
   */
  zoom?: number;
  /**
   * When false, keep the camera zoomed after this ring (pan to the next target
   * instead of zooming out). Default true. Phase default: {@link StubCtx.zoomOut}.
   */
  zoomOut?: boolean;
  /**
   * Spotlight: dim the rest of the page, keep this target as the focal point.
   */
  focus?: boolean;
  /**
   * Caption text color (CSS color). Overrides tone label color when set.
   */
  color?: string;
  /**
   * Move the demo cursor to the target while this ring is up (default true
   * for authored stub queues; set false to keep cursor hidden).
   */
  cursor?: boolean;
  /**
   * Optional link to a todo item id. When set, Method fill/click advances that
   * todo row instead of relying on stub array index (avoids password/submit/username
   * alphabetical reorder bugs).
   */
  todo?: string;
  /** Slot key from stubBefore/After map (e.g. "username") - set by resolver. */
  slotId?: string;
  /**
   * Pointer feel when touchMode is on (0.13+):
   * - `tap` - short press via touchscreen (default in touch mode)
   * - `hold` - long-press (~600ms) then release
   * - `click` - mouse click even in touch mode
   */
  gesture?: "tap" | "hold" | "click" | "swipe";
}

/** A static stub phase: named ring slots to paint before or after a step. */
export type HighlightStubPhase = Record<string, WaygraphHighlightStub>;

/**
 * One yap/slide in a multi-step demo caption sequence, painted with {@link StubCtx.slides}.
 * The demo pauses on each (Next, or auto-next) before moving on.
 */
export interface WaygraphSlide extends FixtureDurationFields {
  /** Primary caption (required). */
  caption: string;
  detail?: string;
  tag?: string;
  /** Optional ring while this slide is showing. */
  selector?: string;
  tone?: HighlightTone;
  size?: HighlightSize;
  weight?: HighlightWeight;
  /** Magnify via camera (Screen Studio) while this slide is showing. */
  zoom?: number;
}

/**
 * Demo ring tones (iconified).
 * Automation (`auto`) is gray so authored planned/info/warning/danger/success stand out.
 * `orange` added for Blind Pilot's own real, direct user request: a visible
 * color distinction between a real Playwright-driven action (a Block run,
 * or a raw click/type/upload - `auto` gray, already meant exactly this) and
 * a pure DOM inspection (`auto dom` - orange, new) - "gray is waygraph
 * playwright run. orange is dom check."
 */
export type HighlightTone =
  | "planned"
  | "auto"
  | "info"
  | "warning"
  | "danger"
  | "success"
  | "orange";

/** Ring + label scale. */
export type HighlightSize = "sm" | "md" | "lg";

/** Label font weight. */
export type HighlightWeight = "normal" | "bold";

/** Optional Flow-level defaults for demo rings (episode-wide). Stub/fixture wins. */
export type HighlightStyleDefaults = {
  tone?: HighlightTone;
  size?: HighlightSize;
  weight?: HighlightWeight;
};

/** A ring or caption after its defaults and overrides are merged, ready to paint. */
export type ResolvedHighlight = WaygraphHighlightStub;

/** A ring's tone (default `planned`). */
export function normalizeHighlightTone(raw: unknown): HighlightTone {
  return choice("tone", raw, ["planned", "auto", "info", "warning", "danger", "success", "orange"]) ?? "planned";
}

/** A ring label's size (default `md`). */
export function normalizeHighlightSize(raw: unknown): HighlightSize {
  return choice("size", raw, ["sm", "md", "lg"]) ?? "md";
}

/** A ring label's weight (default `normal`). */
export function normalizeHighlightWeight(raw: unknown): HighlightWeight {
  return choice("weight", raw, ["normal", "bold"]) ?? "normal";
}
