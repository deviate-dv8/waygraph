/** In-page installer (page.evaluate target) - see banner.js's own header. Creates/updates #wg-banner
 * (click-to-move position, localStorage-persisted, authored titlePos/bannerUi support). `tag`
 * overrides the small caption above the title (default "waygraph demo"). */
export function installBanner(args: {
  title?: string | undefined;
  favicon?: string | undefined;
  bannerPos?: string | undefined;
  todoPos?: string | undefined;
  envAutoplay?: boolean | undefined;
  todoDockUi?: unknown;
  bannerUi?: { hidden?: boolean | undefined; collision?: boolean | undefined; pos?: string | undefined } | undefined;
  tag?: string | undefined;
}): void;
