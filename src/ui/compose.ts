import { bannerCss } from "./components/banner.js";
import { cursorCss } from "./components/cursor.js";
import { pilotFxRingCss, ringCss } from "./components/ring.js";

/** Surface bundles: each surface asks only for the components it paints. */
export const composeRing = (): string => ringCss();
export const composeStepOverlay = (): string => ringCss() + cursorCss() + bannerCss();
export const composePilotFx = (): string => ringCss() + pilotFxRingCss();
