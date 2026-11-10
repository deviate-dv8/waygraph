// The config's device (WAYGRAPH_DEVICE), for the demo's browser and its stage.
import { envString } from "../../engine/env.js";
import { resolveDevice, type Device, type ResolvedDevice } from "../../engine/flow/device.js";

/** The config's device, when it sets one other than the default desktop. */
export function configuredDevice(): ResolvedDevice | undefined {
  const raw = envString("WAYGRAPH_DEVICE");
  if (!raw) return undefined;
  const device = resolveDevice(JSON.parse(raw) as Device);
  return device.preset === "desktop" && device.viewport.width === 1280 && device.viewport.height === 720 ? undefined : device;
}
