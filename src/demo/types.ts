// Shared types for the demo runner. The overlay keeps its state on the Node-side Page object (`page.__wg*`), because the
// in-page overlay is wiped on every navigation.
import type { Page } from "@playwright/test";
import type { ResolvedHighlight } from "../engine/stub/ring.js";
import type { TodoDockState } from "../engine/stub/todos.js";
import type { DeviceState } from "../engine/stub/viewport.js";

export type WgPage = Page;

// The overlay's Node-side state lives on the Page object (`page.__wgVideoViewport`, `page.__wgNetworkHistory`, ...).
declare module "playwright-core" {
  interface Page {
    [key: `__wg${string}`]: any;
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
