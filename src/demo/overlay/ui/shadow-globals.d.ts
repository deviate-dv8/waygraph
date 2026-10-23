// Globals defined in-page by installShadowRoot (ui/shadow.ts). Used by overlay code in place of `document.*`.
declare function __wgById<E extends HTMLElement = HTMLElement>(id: string): E | null;
declare function __wgQ<E extends Element = HTMLElement>(selector: string): E | null;
declare function __wgQA<E extends Element = HTMLElement>(selector: string): E[];
declare function __wgAdd<T extends Node>(node: T): T;
declare function __wgCss(css: string, key: string): void;

// Installed by demo/overlay/inpage/core.ts's installCore - the shared ring primitive every surface
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

// Ring, cursor, panel and beacon calls the overlay installs (inpage/core.ts, stamp.ts, panel-chrome.ts).
interface Window {
  __wgMoveCursorTo?: (x: number, y: number, ms?: number, instant?: boolean) => void;
  __wgClickPulse?: (x: number, y: number, tone?: string) => void;
  __wgPositionRing?: (
    box: { x: number; y: number; width: number; height: number },
    label: string,
    tone?: string,
    style?: { size?: string; weight?: string; color?: string },
  ) => void;
  __wgHideRing?: (opts?: { clearZoom?: boolean }) => void;
  __wgPendingNavClickLabel?: string;
  __wgWirePanelChrome?: (panel: HTMLElement, storageKey: string, chromeTitle?: string, opts?: Record<string, unknown>) => void;
  __wgStampModal?: (
    el: Element,
    kind: string,
    meta?: Record<string, unknown>,
  ) => void;
  __wgOverlayBeacon?: () => Array<{
    id: string | null;
    modal: string | null;
    ready: boolean;
    phase: string | null;
    step: string | null;
    block: string | null;
    collapsed: boolean;
    opacity: string;
    textLen: number;
    w: number;
    h: number;
    visible: boolean;
  }>;
}

// The overlay's in-page bridge: every `window.__wg*` value the demo, auto and pilot overlays install and call.
interface Window {
  [key: `__wg${string}`]: any;
}

// Timers and payloads the overlay parks on its own elements.
interface HTMLElement {
  _wgTimer?: ReturnType<typeof setTimeout> | undefined;
  _wgLastPayload?: any;
}
