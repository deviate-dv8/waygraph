import type { Page } from "@playwright/test";
import type { NetworkEntry } from "./inpage/network.js";

/** Records one network-tab entry (and paints it live) - see network-capture.js's own header. */
export function recordNetworkEntry(page: Page, entry: NetworkEntry): Promise<void>;
/** Replays page.__wgNetworkHistory into a freshly (re)installed panel after a navigation. */
export function restoreNetworkHistory(page: Page): Promise<void>;
/** Hooks page.on('request'/'requestfinished') to capture real page traffic into the same panel. */
export function installNetworkCapture(page: Page): void;
