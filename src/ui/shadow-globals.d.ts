// Globals defined in-page by installShadowRoot (ui/shadow.ts). Used by overlay code in place of `document.*`.
declare function __wgById<E extends HTMLElement = HTMLElement>(id: string): E | null;
declare function __wgQ<E extends Element = HTMLElement>(selector: string): E | null;
declare function __wgQA<E extends Element = HTMLElement>(selector: string): E[];
declare function __wgAdd<T extends Node>(node: T): T;
declare function __wgCss(css: string, key: string): void;

// Installed by runner/inpage/core.ts's installCore - the shared ring primitive every surface
// (demo/auto's singleton #wg-ring, Pilot's several fixture rings) paints through. Optional on
// `Window` since not every page calls installCore (only ones that ensureInstalled/installOverlay).
interface Window {
  __wgPaintRingAt?: (
    ringId: string,
    labelId: string,
    box: { x: number; y: number; width: number; height: number },
    label: string,
    tone: string,
    style?: { size?: string; weight?: string; color?: string },
  ) => void;
}

// The overlay's in-page bridge: every `window.__wg*` value the demo, auto and pilot overlays install and call.
interface Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: `__wg${string}`]: any;
}

// Timers and payloads the overlay parks on its own elements.
interface HTMLElement {
  _wgTimer?: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _wgLastPayload?: any;
}
