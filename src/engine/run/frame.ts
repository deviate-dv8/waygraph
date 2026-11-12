// A page that lives in an iframe (an embedded widget on a partner's page): its selectors mean "inside that frame". A page
// says `frame: "#embed"` once, and every Block of that page, its checks and its read, get the page with its locators scoped
// to the frame: no selector carries a prefix, and the same Sel file serves the page and its twin outside a frame.
import type { Page } from "@playwright/test";

/** Each page's frame, by Checkpoint tag. On globalThis, like the other registries a project's waygraph copy shares. */
const frames: Map<string, string> = ((globalThis as { [k: symbol]: Map<string, string> | undefined })[Symbol.for("waygraph.pageFrames")] ??= new Map());

/** Says the page `tag` is inside the frame `selector`. */
export function registerFrame(tag: string, selector: string): void {
  frames.set(tag, selector);
}

const REAL = Symbol.for("waygraph.realPage");

/** The page itself, for what is kept per page (checked elements, results): a scoped page stands for the same page. */
export function realPage<P extends Page>(page: P): P {
  return ((page as unknown as { [REAL]?: P })[REAL] ?? page) as P;
}

/** The locator constructors that become the frame's. */
const SCOPED = new Set(["locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByTestId", "getByAltText", "getByTitle"]);

/** `page`, as the Blocks of the page `tag` should see it: its locators inside the page's frame, when it has one. */
export function inFrameOf(page: Page, tag: string): Page {
  const selector = frames.get(tag);
  if (!selector || typeof (page as { frameLocator?: unknown }).frameLocator !== "function") return page;
  return new Proxy(page, {
    get(target, prop) {
      if (prop === REAL) return target;
      if (typeof prop === "string" && SCOPED.has(prop)) {
        const frame = target.frameLocator(selector) as unknown as Record<string, (...args: unknown[]) => unknown>;
        const method = frame[prop];
        return method ? method.bind(frame) : undefined;
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
