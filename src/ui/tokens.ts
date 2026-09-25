/**
 * Design tokens for every waygraph overlay surface (demo stepper, pilot badge/panel,
 * step overlay). The one place a colour changes: components in ./components build their
 * CSS from these, so surfaces cannot drift apart.
 */

export type ToneName = "planned" | "auto" | "info" | "warning" | "danger" | "success" | "orange";

export interface Tone {
  /** Ring border + click-pulse border. */
  ring: string;
  /** Ring halo (box-shadow) colour. */
  glow: string;
  /** Click-pulse fill. */
  pulse: string;
  /** Label background / foreground. */
  labelBg: string;
  labelFg: string;
}

export const TONES: Record<ToneName, Tone> = {
  planned: { ring: "#7C3AED", glow: "rgba(124,58,237,.16)", pulse: "rgba(124,58,237,.25)", labelBg: "#7C3AED", labelFg: "#fff" },
  auto: { ring: "#9CA3AF", glow: "rgba(156,163,175,.28)", pulse: "rgba(156,163,175,.28)", labelBg: "#6B7280", labelFg: "#fff" },
  info: { ring: "#3B82F6", glow: "rgba(59,130,246,.22)", pulse: "rgba(59,130,246,.28)", labelBg: "#2563EB", labelFg: "#fff" },
  warning: { ring: "#EAB308", glow: "rgba(234,179,8,.22)", pulse: "rgba(234,179,8,.28)", labelBg: "#EAB308", labelFg: "#1c1917" },
  danger: { ring: "#EF4444", glow: "rgba(239,68,68,.22)", pulse: "rgba(239,68,68,.28)", labelBg: "#DC2626", labelFg: "#fff" },
  success: { ring: "#22C55E", glow: "rgba(34,197,94,.22)", pulse: "rgba(34,197,94,.28)", labelBg: "#16A34A", labelFg: "#fff" },
  orange: { ring: "#F97316", glow: "rgba(249,115,22,.22)", pulse: "rgba(249,115,22,.28)", labelBg: "#EA580C", labelFg: "#fff" },
};

/** Dark surface shared by panels, banner, docks, HUD chips. */
export const SURFACE = "rgba(20,10,40,.94)";
export const ACCENT = "#7C3AED";
/** Secondary accent used on the dark surface (section titles, kinds). */
export const ACCENT_SOFT = "#c9a6ff";

/** Stacking order: one scale instead of magic numbers. */
export const Z = { top: 2147483647, ring: 2147483646, fx: 2147483645, focus: 2147483644, dock: 2147483000 } as const;
