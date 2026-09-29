// Globals defined in-page by installShadowRoot (ui/shadow.ts). Used by overlay code in place of `document.*`.
declare function __wgById(id: string): HTMLElement | null;
declare function __wgQ<E extends Element = HTMLElement>(selector: string): E | null;
declare function __wgQA<E extends Element = HTMLElement>(selector: string): E[];
declare function __wgAdd<T extends Node>(node: T): T;
declare function __wgCss(css: string, key: string): void;

// Installed by runner/inpage/core.js's installCore - the shared ring primitive every surface
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
  __wgHideRingAt?: (ringId: string, labelId: string) => void;
}
