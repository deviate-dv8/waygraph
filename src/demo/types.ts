// Shared types for the demo runner. The overlay keeps its state on the Node-side Page object (`page.__wg*`), because the
// in-page overlay is wiped on every navigation.
import type { Page } from "@playwright/test";
import type { ResolvedHighlight } from "../engine/stub/ring.js";
import type { BannerPos } from "../engine/stub/stub.js";
import type { TodoDockState, TodoDockUiResolved } from "../engine/stub/todos.js";
import type { DeviceState } from "../engine/stub/viewport.js";

export type WgPage = Page;

// The overlay's Node-side state lives on the Page object (`page.__wgVideoViewport`, `page.__wgNetworkHistory`, ...).
declare module "playwright-core" {
  interface Page {
    /** The recordVideo canvas size, when recording: the stage a device shell is centered in. */
    __wgVideoViewport?: { width: number; height: number } | undefined;
    /** Without a video, the window size at the first device switch (the stage from then on). */
    __wgHeadedStage?: { width: number; height: number } | undefined;
    /** The device shell's size, rebuilt after a navigation wipes it. */
    __wgDeviceShell?: { width: number; height: number } | undefined;
    __wgDesktopFlat?: boolean | undefined;
    __wgDevicePreset?: string | undefined;
    __wgDeviceOrient?: string | undefined;
    /** The real setViewportSize, kept while the demo makes the page's own one do nothing. */
    __wgRealSetViewportSize?: Page["setViewportSize"] | undefined;
    /** The network panel's rows; the panel's DOM does not survive a navigation, this does. */
    __wgNetworkHistory?: NetworkEntry[] | undefined;
    __wgNetworkNeedsRestore?: boolean | undefined;
    __wgNetworkCaptureInstalled?: boolean | undefined;
    __wgNetworkTabVisible?: boolean | undefined;
    /** A step is acting: the overlay's chrome lets pointer events through (demo/overlay/acting.ts). */
    __wgActing?: boolean | undefined;
  }
  interface Keyboard {
    __wgBeatPatched?: boolean;
  }
}

/** A value the stepper's parts share and update (the todo dock as it advances, the device, the step's rings). */
export interface Ref<T> {
  current: T;
}

/** What the demo carries between a step's panels, its fill / click theater and a re-paint after navigation. */
export interface StepperRefs {
  stubBefore: Ref<ResolvedHighlight[]>;
  todoDock: Ref<TodoDockState | undefined>;
  device: Ref<DeviceState | undefined>;
}

/** A box on the page, in CSS pixels. */
export interface WgBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The banner UX installOverlay takes: where it sits and how it behaves. */
export interface BannerUiState {
  pos?: BannerPos;
  collision?: boolean;
  hidden?: boolean;
  captionFadeMs?: number;
}

/** What installOverlay hands every in-page installer (inpage/*.ts) through page.evaluate; auto and pilot pass only what they use. */
export interface OverlayInstallArgs {
  title?: string | undefined;
  favicon?: string;
  bannerPos?: BannerPos;
  todoPos?: "left" | "right";
  envAutoplay?: boolean;
  todoDockUi?: TodoDockUiResolved;
  bannerUi?: BannerUiState | null;
  tag?: string;
}

/** One row of the network panel (inpage/network.ts): a page request or an API Block's call. */
export interface NetworkEntry {
  method?: string | undefined;
  url?: string | undefined;
  status?: number | undefined;
  ok?: boolean | undefined;
  ms?: number | undefined;
  reqHeaders?: Record<string, string> | undefined;
  resHeaders?: Record<string, string> | undefined;
  reqBody?: string | undefined;
  resBody?: string | undefined;
}
