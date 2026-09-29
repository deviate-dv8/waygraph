import type { Page } from "@playwright/test";
import type { DeviceState } from "../highlights.js";

export function applyDeviceToPage(
  page: Page,
  device: DeviceState | undefined,
  sync: "set" | "clear" | "keep",
): Promise<void>;
export function applyVideoDeviceStage(page: Page, shell: unknown, viewport: unknown, opts?: unknown): Promise<void>;
