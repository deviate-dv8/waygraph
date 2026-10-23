// The device a stub puts the page in: preset, size, touch and orientation.

/** Named viewport presets (0.13+). */
export type DevicePreset = "mobile" | "tablet" | "desktop";

/** Explicit viewport box. */
export type DeviceViewport = {
  width: number;
  height: number;
  deviceScaleFactor?: number;
};

/**
 * Carried device fixture (todo-dock shaped persist).
 * Omit on a later step = keep; hideDevice / desktop = clear to desktop.
 */
export type DeviceState = {
  preset: DevicePreset;
  viewport: DeviceViewport;
  /** Playwright-ish: treat as mobile layout. */
  isMobile: boolean;
  /** Context needs hasTouch for touchscreen.tap (demo launches with hasTouch). */
  hasTouch: boolean;
  /** Demo gesture theater: finger cursor, tap/hold timing, prefer touchscreen. */
  touchMode: boolean;
  /** Viewport orientation (0.13.3+). Default derived from width/height. */
  orientation?: DeviceOrientation;
};

/** Portrait (tall) or landscape (wide). */
export type DeviceOrientation = "portrait" | "landscape";