// The parts of the overlay a demo leaves out (the config's demo.overlay, as WAYGRAPH_OVERLAY_HIDE).
import { envString } from "../../engine/env.js";

/** A part of the demo's overlay that can be left out. */
export type OverlayPart = "banner" | "panel" | "checks" | "todos";

/** Whether the demo leaves `part` out. */
export function overlayHides(part: OverlayPart): boolean {
  return (envString("WAYGRAPH_OVERLAY_HIDE") ?? "").split(",").map((p) => p.trim()).includes(part);
}
