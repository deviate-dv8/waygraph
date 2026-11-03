// While a step's expectations run, its page is read-only: an expectation reads and judges, and an action on the page
// (a click, a fill, a navigation, a key press) throws, naming it. Playwright has no hook for this, so its Page and
// Locator methods that change the page are wrapped, once per process (the wrapper only acts on a page marked here), and
// the page's own keyboard and mouse are guarded while it is read-only.
import type { Page } from "@playwright/test";
import { WaygraphError, MSG_EXPECT_CHANGED_PAGE } from "../errors.js";

/** Pages whose expectations are running, and the step they belong to. On globalThis: src and dist can share a page. */
const readOnly: WeakMap<Page, string> = ((globalThis as { [k: symbol]: WeakMap<Page, string> | undefined })[
  Symbol.for("waygraph.readOnlyPages")
] ??= new WeakMap());

const LOCATOR_ACTIONS = ["click", "dblclick", "tap", "fill", "type", "press", "pressSequentially", "clear", "check", "uncheck", "setChecked", "selectOption", "setInputFiles", "hover", "dragTo", "dispatchEvent"];
const PAGE_ACTIONS = ["goto", "reload", "goBack", "goForward", "click", "dblclick", "tap", "fill", "type", "press", "check", "uncheck", "selectOption", "setInputFiles", "hover", "dragAndDrop", "dispatchEvent", "setViewportSize"];
const INPUT_ACTIONS = ["press", "type", "insertText", "down", "up", "click", "dblclick", "move", "wheel"];

type Patchable = Record<string, unknown> & { __wgReadOnlyPatched?: boolean };

/** Wraps `names` on `proto` so they throw while the page `pageOf(this)` is read-only. */
function guard(proto: Patchable, names: readonly string[], pageOf: (self: unknown) => Page | undefined, what: string): void {
  if (proto.__wgReadOnlyPatched) return;
  proto.__wgReadOnlyPatched = true;
  for (const name of names) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      const page = pageOf(this);
      const step = page && readOnly.get(page);
      if (step !== undefined) throw new WaygraphError("WG_EXPECT_CHANGED_PAGE", MSG_EXPECT_CHANGED_PAGE(`${what}.${name}()`, step));
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

/** Installs the guard on this page's Playwright prototypes (once per process, whichever page comes first). */
function install(page: Page): void {
  // A stand-in page (a test's fake) has no Playwright prototypes to guard.
  if (typeof page.locator !== "function") return;
  guard(Object.getPrototypeOf(page) as Patchable, PAGE_ACTIONS, (self) => self as Page, "page");
  guard(Object.getPrototypeOf(page.locator("html")) as Patchable, LOCATOR_ACTIONS, (self) => (self as { page(): Page }).page(), "locator");
}

/** Shadows the page's keyboard and mouse actions with ones that throw; returns what puts them back. */
function guardInput(page: Page, step: string): () => void {
  const restores: (() => void)[] = [];
  for (const [what, device] of [["keyboard", page.keyboard], ["mouse", page.mouse]] as const) {
    if (!device) continue;
    const own = device as unknown as Record<string, unknown>;
    for (const name of INPUT_ACTIONS) {
      if (typeof own[name] !== "function") continue;
      own[name] = () => {
        throw new WaygraphError("WG_EXPECT_CHANGED_PAGE", MSG_EXPECT_CHANGED_PAGE(`${what}.${name}()`, step));
      };
      restores.push(() => delete own[name]);
    }
  }
  return () => restores.forEach((restore) => restore());
}

/** Runs `fn` with `page` read-only: an action on it throws, saying it came from an expectation of `step`. */
export async function readOnlyWhile<T>(page: Page, step: string, fn: () => Promise<T>): Promise<T> {
  install(page);
  readOnly.set(page, step);
  const restoreInput = guardInput(page, step);
  try {
    return await fn();
  } finally {
    restoreInput();
    readOnly.delete(page);
  }
}
