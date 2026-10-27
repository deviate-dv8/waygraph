// While a step acts, the overlay's chrome (docks, banner, panel, chips) lets pointer events through to the page: a dock
// sitting over a button must never take the click the step is making. Kept on the page object, so the overlay rebuilt
// after a mid-step navigation is click-through too.
import type { WgPage } from "../types.js";
import { ignorePageGone } from "../../engine/page-gone.js";

/** Marks the step as acting (or done acting) and applies it to the overlay on the page now. */
export async function setActing(page: WgPage, acting: boolean): Promise<void> {
  page.__wgActing = acting;
  await applyActing(page);
}

/** Applies the page's acting state to its overlay (after a navigation rebuilt it). */
export async function applyActing(page: WgPage): Promise<void> {
  await page
    .evaluate((on) => {
      if (typeof __wgById === "function") __wgById("wg-ui")?.toggleAttribute("data-acting", on);
    }, !!page.__wgActing)
    .catch(ignorePageGone);
}
