// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { DeviceOrientation, DevicePreset, DeviceState, DeviceViewport } from "./types.js";

/** Built-in preset sizes (CSS pixels) — stored in portrait for mobile/tablet. */
export const DEVICE_PRESETS: Record<DevicePreset, Omit<DeviceState, "touchMode"> & { touchMode?: boolean }> = {
  mobile: {
    preset: "mobile",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    isMobile: true,
    hasTouch: true,
    touchMode: true,
    orientation: "portrait",
  },
  tablet: {
    preset: "tablet",
    viewport: { width: 768, height: 1024, deviceScaleFactor: 2 },
    isMobile: true,
    hasTouch: true,
    touchMode: true,
    orientation: "portrait",
  },
  desktop: {
    preset: "desktop",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    isMobile: false,
    hasTouch: false,
    touchMode: false,
    orientation: "landscape",
  },
};


export function normalizeDevicePreset(raw: unknown): DevicePreset | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "mobile" || s === "phone" || s === "m") return "mobile";
  if (s === "tablet" || s === "pad" || s === "t") return "tablet";
  if (s === "desktop" || s === "desk" || s === "d" || s === "main") return "desktop";
  return undefined;
}


export function normalizeDeviceOrientation(raw: unknown): DeviceOrientation | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "portrait" || s === "port" || s === "tall" || s === "p") return "portrait";
  if (s === "landscape" || s === "land" || s === "wide" || s === "l") return "landscape";
  return undefined;
}


/** Infer orientation from box (square counts as landscape). */
export function orientationFromViewport(vp: DeviceViewport): DeviceOrientation {
  return vp.height > vp.width ? "portrait" : "landscape";
}


/**
 * Swap width/height so the viewport matches the requested orientation.
 * Preserves deviceScaleFactor. No-op when already oriented.
 */
export function applyOrientation(
  state: DeviceState,
  orientation: DeviceOrientation,
): DeviceState {
  const vp = { ...state.viewport };
  const current = orientationFromViewport(vp);
  if (current !== orientation) {
    const w = vp.width;
    vp.width = vp.height;
    vp.height = w;
  }
  return { ...state, viewport: vp, orientation };
}


/** Resolve a preset name or partial state into a full DeviceState. */
export function resolveDeviceState(
  input: DevicePreset | DeviceState | DeviceViewport | undefined,
  touchOverride?: boolean,
  orientationOverride?: DeviceOrientation,
): DeviceState | undefined {
  if (input === undefined) return undefined;
  let resolved: DeviceState | undefined;
  if (typeof input === "string") {
    const p = normalizeDevicePreset(input);
    if (!p) return undefined;
    const base = DEVICE_PRESETS[p];
    const touchMode = touchOverride !== undefined ? !!touchOverride : !!base.touchMode;
    resolved = {
      preset: base.preset,
      viewport: { ...base.viewport },
      isMobile: base.isMobile,
      hasTouch: base.hasTouch || touchMode,
      touchMode,
      orientation: base.orientation || orientationFromViewport(base.viewport),
    };
  } else if ("width" in input && "height" in input && !("preset" in input)) {
    const vp = input as DeviceViewport;
    const touchMode = touchOverride !== undefined ? !!touchOverride : true;
    const box = {
      width: Math.max(200, Math.floor(vp.width)),
      height: Math.max(200, Math.floor(vp.height)),
      ...(vp.deviceScaleFactor !== undefined
        ? { deviceScaleFactor: vp.deviceScaleFactor }
        : { deviceScaleFactor: 2 }),
    };
    resolved = {
      preset: "mobile",
      viewport: box,
      isMobile: true,
      hasTouch: true,
      touchMode,
      orientation: orientationFromViewport(box),
    };
  } else {
    const d = input as DeviceState;
    const preset = normalizeDevicePreset(d.preset) || "desktop";
    const base = DEVICE_PRESETS[preset];
    const touchMode =
      touchOverride !== undefined
        ? !!touchOverride
        : d.touchMode !== undefined
          ? !!d.touchMode
          : !!base.touchMode;
    const viewport = d.viewport
      ? {
          width: Math.max(200, Math.floor(d.viewport.width)),
          height: Math.max(200, Math.floor(d.viewport.height)),
          ...(d.viewport.deviceScaleFactor !== undefined
            ? { deviceScaleFactor: d.viewport.deviceScaleFactor }
            : base.viewport.deviceScaleFactor !== undefined
              ? { deviceScaleFactor: base.viewport.deviceScaleFactor }
              : {}),
        }
      : { ...base.viewport };
    resolved = {
      preset,
      viewport,
      isMobile: d.isMobile !== undefined ? !!d.isMobile : base.isMobile,
      hasTouch: d.hasTouch !== undefined ? !!d.hasTouch : base.hasTouch || touchMode,
      touchMode,
      orientation:
        normalizeDeviceOrientation(d.orientation) ||
        orientationFromViewport(viewport),
    };
  }
  if (!resolved) return undefined;
  const want =
    orientationOverride ||
    (typeof input === "object" && input && "orientation" in input
      ? normalizeDeviceOrientation((input as DeviceState).orientation)
      : undefined);
  if (want) return applyOrientation(resolved, want);
  if (!resolved.orientation) {
    resolved = {
      ...resolved,
      orientation: orientationFromViewport(resolved.viewport),
    };
  }
  return resolved;
}


/**
 * Carry-forward for device fixtures (mirror {@link applyTodoPhase}).
 * - clear: hideDevice / clearDevice / device("desktop") with clear intent
 * - set: author set device/viewport/touch this phase
 * - keep: omit - preserve previous (whole episode remain)
 */
export function applyDevicePhase(
  prev: DeviceState | undefined,
  phase: {
    deviceSync?: "set" | "clear" | "keep";
    device?: DeviceState;
  },
): { device: DeviceState | undefined; sync: "set" | "clear" | "keep" } {
  const sync =
    phase.deviceSync ||
    (phase.device ? "set" : "keep");
  if (sync === "clear") {
    return { device: resolveDeviceState("desktop", false), sync: "clear" };
  }
  if (sync === "set") {
    if (phase.device) return { device: phase.device, sync: "set" };
    return { device: resolveDeviceState("desktop", false), sync: "clear" };
  }
  return { device: prev, sync: "keep" };
}
