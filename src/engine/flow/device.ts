// The device a flow plays on: desktop by default, a tablet or a phone, either way round. The config sets the project's
// (`device`), a flow its own (`map({ device })`); both are the same value.

/** A device by name. */
export type DeviceName = "desktop" | "tablet" | "mobile";

/** A device by its parts: a named one turned (`{ preset: "mobile", orientation: "landscape" }`), or a size of your own. */
export interface DeviceOptions {
  /** The device it starts from. Default `"desktop"`. */
  preset?: DeviceName;
  /** A size of your own (both, or the preset's). */
  width?: number;
  height?: number;
  /** Which way round: `"portrait"` (tall) or `"landscape"` (wide). Default the preset's (a phone portrait, a desktop landscape). */
  orientation?: "portrait" | "landscape";
  /** A touch screen (taps instead of clicks). Default the preset's: a phone and a tablet are touch. */
  touch?: boolean;
}

/** A device: a name (`"mobile"`) or its parts. */
export type Device = DeviceName | DeviceOptions;

/** A device as the browser takes it. */
export interface ResolvedDevice {
  preset: DeviceName;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  /** A phone or tablet's layout (the page's `<meta viewport>` and mobile user agent rules apply). */
  isMobile: boolean;
  hasTouch: boolean;
  orientation: "portrait" | "landscape";
}

/** Each named device: its size held its usual way round, and what it is. */
export const DEVICES: Readonly<Record<DeviceName, Omit<ResolvedDevice, "orientation">>> = {
  desktop: { preset: "desktop", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { preset: "tablet", viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  mobile: { preset: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** The browser's settings for `device`; throws on a name or orientation it doesn't know, naming it. */
export function resolveDevice(device: Device): ResolvedDevice {
  const options: DeviceOptions = typeof device === "string" ? { preset: device } : device;
  const preset = options.preset ?? "desktop";
  const base = DEVICES[preset];
  if (!base) throw new Error(`waygraph: device ${JSON.stringify(preset)} isn't one: "desktop", "tablet" or "mobile"`);
  if (options.orientation !== undefined && options.orientation !== "portrait" && options.orientation !== "landscape") {
    throw new Error(`waygraph: orientation ${JSON.stringify(options.orientation)} isn't one: "portrait" or "landscape"`);
  }
  const width = Math.floor(options.width ?? base.viewport.width);
  const height = Math.floor(options.height ?? base.viewport.height);
  const natural = width >= height ? "landscape" : "portrait";
  const orientation = options.orientation ?? natural;
  // Turned: the same device the other way round.
  const viewport = orientation === natural ? { width, height } : { width: height, height: width };
  const hasTouch = options.touch ?? base.hasTouch;
  return { preset, viewport, deviceScaleFactor: base.deviceScaleFactor, isMobile: base.isMobile, hasTouch, orientation };
}
