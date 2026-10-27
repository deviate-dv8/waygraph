// The one patch on Playwright's Locator and Page for every surface that shows what the automation touches (the demo
// stepper, auto explore). fill, click, waitFor and waitForTimeout are wrapped once per process; each wrapper looks up the
// surface registered for `locator.page()`, so a page with no theater (a plain run, another page in the same process)
// runs Playwright's own method untouched. Playwright has no hook for this, so the wrap is the seam; nothing else patches
// these methods.
import type { Locator, Page } from "@playwright/test";
import { isPageGone } from "../../engine/page-gone.js";

/** How a click is performed once the theater has shown it. */
export type ClickGesture = "click" | "tap" | "hold";

export interface LocatorTheater {
  /** Before the value is typed: cursor, ring, typing badge. A failure here never stops the fill. */
  beforeFill(locator: Locator, options: { timeout?: number } | undefined): Promise<void>;
  /** Per-character typing delay, ms. */
  typingDelay(): number;
  afterFill(locator: Locator): Promise<void>;
  /** Before the click: cursor, ring, pulse. Returns the gesture to perform. A failure here never stops the click. */
  beforeClick(locator: Locator, options: { timeout?: number } | undefined): Promise<ClickGesture>;
  /** How long a "hold" keeps the press down, ms. */
  holdMs(): number;
  afterClick(locator: Locator): Promise<void>;
  /** A shorter timeout for a wait that may never succeed (a probe), or the declared one. */
  capWait?(declaredMs: number): number;
  /** A shorter plain sleep. */
  capSleep?(ms: number): number;
}

const theaters = new WeakMap<Page, LocatorTheater>();

type Timeout = { timeout?: number } | undefined;
type LocatorProto = {
  fill(this: Locator, value: string, options?: Timeout): Promise<void>;
  click(this: Locator, options?: Timeout & { delay?: number }): Promise<void>;
  waitFor(this: Locator, options?: Timeout & { state?: string }): Promise<void>;
  __wgTheaterPatched?: boolean;
};
type PageProto = { waitForTimeout(this: Page, ms: number): Promise<void>; __wgTheaterPatched?: boolean };

/** Shows every fill and click on `page` through `theater` from now on. */
export function setLocatorTheater(page: Page, theater: LocatorTheater): void {
  theaters.set(page, theater);
  patchLocator(Object.getPrototypeOf(page.locator("html")) as LocatorProto);
  patchPage(Object.getPrototypeOf(page) as PageProto);
}

/**
 * The theater only shows the action; the action itself must still run. So a theater failure is printed (unless the page
 * simply went away) and the real fill / click goes ahead.
 */
function theaterFailed(err: unknown): undefined {
  if (!isPageGone(err)) console.error(`waygraph: overlay: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  return undefined;
}

/** Input types made of segments or pickers (a date, a colour, a slider): keys typed one by one don't build their value. */
const NOT_TYPED = new Set(["date", "datetime-local", "time", "month", "week", "color", "range", "file", "checkbox", "radio"]);

/** Whether the demo types this field key by key (a text field), or fills it at once as a run does. */
async function typedByHand(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((el, notTyped) => !(el instanceof HTMLInputElement && notTyped.includes(el.type)), [...NOT_TYPED])
    .catch(() => true);
}

/** Whether the field now holds `value` (a contenteditable, with no input value, counts as holding it). */
async function holds(locator: Locator, value: string): Promise<boolean> {
  return locator.inputValue({ timeout: 1000 }).then((v) => v === String(value), () => true);
}

function patchLocator(proto: LocatorProto): void {
  if (proto.__wgTheaterPatched) return;
  proto.__wgTheaterPatched = true;
  const { fill, click, waitFor } = proto;

  proto.fill = async function (value, options) {
    const theater = theaters.get(this.page());
    if (!theater) return fill.call(this, value, options);
    await theater.beforeFill(this, options).catch(theaterFailed);
    const timeout = options?.timeout !== undefined ? { timeout: options.timeout } : {};
    if (await typedByHand(this)) {
      try {
        // Not this.clear(): Locator.clear() is fill(""), which would come back into this wrapper.
        await fill.call(this, "", timeout);
        await this.pressSequentially(String(value), { delay: theater.typingDelay(), ...timeout });
      } catch {
        // An element pressSequentially can't type into (a contenteditable, say): Playwright's own fill.
        await fill.call(this, value, options);
      }
      // The typing is for the eye: the demo enters exactly what a run enters. A field that turned the keys into something
      // else (a mask reading "," as a decimal point) gets Playwright's own fill, as a run does.
      if (!(await holds(this, value))) await fill.call(this, value, options);
    } else {
      await fill.call(this, value, options);
    }
    await theater.afterFill(this);
  };

  proto.click = async function (options) {
    const theater = theaters.get(this.page());
    if (!theater) return click.call(this, options);
    const gesture = (await theater.beforeClick(this, options).catch(theaterFailed)) ?? "click";
    if (gesture === "hold") await click.call(this, { ...(options ?? {}), delay: theater.holdMs() });
    else if (gesture === "tap") {
      try {
        await this.tap(options);
      } catch {
        // A context without touch: a real click.
        await click.call(this, options);
      }
    } else await click.call(this, options);
    await theater.afterClick(this);
  };

  proto.waitFor = function (options) {
    const theater = theaters.get(this.page());
    if (!theater?.capWait) return waitFor.call(this, options);
    const declared = options?.timeout ?? 30000;
    return waitFor.call(this, { ...(options ?? {}), timeout: theater.capWait(declared) });
  };
}

function patchPage(proto: PageProto): void {
  if (proto.__wgTheaterPatched) return;
  proto.__wgTheaterPatched = true;
  const { waitForTimeout } = proto;
  proto.waitForTimeout = function (ms) {
    const theater = theaters.get(this);
    return waitForTimeout.call(this, theater?.capSleep ? theater.capSleep(ms) : ms);
  };
}
