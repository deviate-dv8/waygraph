// Globals defined in-page by installShadowRoot (ui/shadow.ts). Used by overlay code in place of `document.*`.
declare function __wgById<E extends HTMLElement = HTMLElement>(id: string): E | null;
declare function __wgQ<E extends Element = HTMLElement>(selector: string): E | null;
declare function __wgQA<E extends Element = HTMLElement>(selector: string): E[];
declare function __wgAdd<T extends Node>(node: T): T;
declare function __wgCss(css: string, key: string): void;
/** Attributes for {@link __wgEl}. */
interface WgElProps {
  id?: string | undefined;
  class?: string | undefined;
  style?: string | undefined;
  title?: string | undefined;
  data?: Record<string, string | number | undefined> | undefined;
  attrs?: Record<string, string | number | undefined> | undefined;
}
/** A child for {@link __wgEl}: text becomes a text node; arrays are flattened; null / undefined / false are skipped. */
type WgChild = string | number | Node | null | undefined | false | readonly WgChild[];
/** Builds an element: `__wgEl("span", { class: "wg-x" }, "text", child)`. Text is never parsed as HTML. */
declare function __wgEl<K extends keyof HTMLElementTagNameMap>(tag: K, props?: WgElProps | null, ...children: WgChild[]): HTMLElementTagNameMap[K];
/** Replaces an element's children. */
declare function __wgSet(el: Element, ...children: WgChild[]): void;
/** One of waygraph's static SVG icon constants as an element. */
declare function __wgSvg(markup: string): Element;

/** A ring label's look: font size, weight and color. */
interface WgRingStyle {
  size?: string;
  weight?: string;
  color?: string;
}

/** How {@link Window.__wgWirePanelChrome} labels and collapses a panel. */
interface WgPanelChromeOpts {
  stepLabel?: string | undefined;
  forceCollapsed?: boolean | undefined;
  fastForward?: boolean | undefined;
  isApi?: boolean | undefined;
}

// Installed by demo/overlay/inpage/core.ts's installCore - the shared ring primitive every surface
// (demo/auto's singleton #wg-ring, Pilot's several fixture rings) paints through. Optional on
// `Window` since not every page calls installCore (only ones that ensureInstalled/installOverlay).
interface Window {
  __wgPaintRingAt?: (
    ringId: string,
    labelId: string,
    box: { x: number; y: number; width: number; height: number },
    label: string,
    tone?: string,
    style?: WgRingStyle,
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
    style?: WgRingStyle,
  ) => void;
  __wgHideRing?: (opts?: { clearZoom?: boolean }) => void;
  __wgPendingNavClickLabel?: string;
  __wgWirePanelChrome?: (panel: HTMLElement, storageKey: string, chromeTitle?: string, opts?: WgPanelChromeOpts) => void;
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

// The todo dock's in-page payload (inpage/todos.ts): the Node side's TodoDockState after a JSON round trip.
interface WgTodoRow {
  id?: string | undefined;
  text?: string | undefined;
  done?: boolean | undefined;
  current?: boolean | undefined;
}
interface WgTodoGroupRow {
  id?: string | undefined;
  title?: string | undefined;
  style?: string | undefined;
  items?: readonly WgTodoRow[] | undefined;
}
interface WgTodoDockRow {
  id?: string | undefined;
  title?: string | undefined;
  style?: string | undefined;
  groups?: readonly WgTodoGroupRow[] | undefined;
}
interface WgTodoUi {
  compact?: boolean | undefined;
  cap?: number | undefined;
  expandCap?: number | undefined;
  collision?: boolean | undefined;
  behindRing?: boolean | undefined;
}
interface WgTodoSyncPayload {
  sync?: string | undefined;
  dock?: WgTodoDockRow | null | undefined;
  pos?: string | null | undefined;
  list?: readonly WgTodoRow[] | undefined;
  todoId?: string | null | undefined;
  replace?: boolean | undefined;
  parallel?: boolean | undefined;
  ui?: WgTodoUi | undefined;
}
interface Window {
  __wgSyncTodos?: (payload: WgTodoSyncPayload | null, pos?: string | null) => void;
  __wgTodoDockUi?: WgTodoUi;
}

// The device chip's in-page payload (inpage/device-chip.ts).
interface WgDevicePayload {
  sync?: string | undefined;
  device?: {
    preset?: string | undefined;
    touchMode?: boolean | undefined;
    orientation?: string | undefined;
    viewport?: { width: number; height: number } | undefined;
  } | null | undefined;
  remain?: boolean | undefined;
  announce?: boolean | undefined;
}
interface Window {
  __wgSyncDevice?: (payload: WgDevicePayload | null) => void;
}

// The overlay's in-page bridge: every `window.__wg*` value the demo, auto and pilot overlays install and call.
interface Window {
  [key: `__wg${string}`]: any;
}

// Timers and payloads the overlay parks on its own elements.
interface HTMLElement {
  _wgTimer?: ReturnType<typeof setTimeout> | undefined;
  _wgLastPayload?: WgTodoSyncPayload | null;
}
