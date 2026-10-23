// Shared types for the demo runner. The overlay keeps its state on the Node-side Page object (`page.__wg*`), because the
// in-page overlay is wiped on every navigation.
import type { Page } from "@playwright/test";

export type WgPage = Page;

// The overlay's Node-side state lives on the Page object (`page.__wgVideoViewport`, `page.__wgNetworkHistory`, ...).
declare module "playwright-core" {
  interface Page {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: `__wg${string}`]: any;
  }
  interface Keyboard {
    __wgBeatPatched?: boolean;
  }
}

/** A box on the page, in CSS pixels. */
export interface WgBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
