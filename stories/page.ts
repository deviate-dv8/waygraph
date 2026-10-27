// What a story renders into: a stand-in for Playwright's Page that runs `evaluate` right here in the story's frame, so
// the overlay's real builders (they run in the page in a demo) paint the real thing. Each story starts clean.
import type { StoryContext } from "@storybook/html-vite";
import { installOverlay } from "../src/demo/overlay/overlay.js";
import type { WgPage } from "../src/demo/types.js";

const stand = {
  evaluate: async <A, R>(fn: (arg: A) => R, arg: A): Promise<Awaited<R>> => await fn(arg),
  addStyleTag: async ({ content }: { content: string }) => {
    const style = document.createElement("style");
    style.textContent = content;
    document.head.append(style);
  },
  on: () => undefined,
  waitForTimeout: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  screenshot: async () => Buffer.alloc(0),
  url: () => location.href,
  viewportSize: () => ({ width: innerWidth, height: innerHeight }),
};

/** The page a story's overlay paints on. */
export const page = stand as unknown as WgPage;

/** A page with some content to paint over: a heading, a button, rows. */
export function appPage(): HTMLElement {
  const main = document.createElement("main");
  main.className = "story-app";
  const h1 = document.createElement("h1");
  h1.textContent = "Equipment";
  const button = document.createElement("button");
  button.id = "story-target";
  button.textContent = "Add equipment";
  main.append(h1, button);
  for (let i = 1; i <= 24; i++) {
    const p = document.createElement("p");
    p.textContent = `Mixer ${i} · Line ${(i % 4) + 1} · last serviced ${i} days ago`;
    main.append(p);
  }
  return main;
}

/** Removes the previous story's overlay and the in-page state it kept. */
function reset(): void {
  document.getElementById("wg-root")?.remove();
  for (const key of Object.keys(window)) if (key.startsWith("__wg")) delete (window as unknown as Record<string, unknown>)[key];
  for (const key of Object.keys(localStorage)) if (key.startsWith("wg-")) localStorage.removeItem(key);
}

/** The story's appearance (the toolbar's light / dark) on the overlay and the page behind it. */
function applyAppearance(context: StoryContext): void {
  const appearance = context.globals["appearance"] === "dark" ? "dark" : "light";
  document.documentElement.dataset.storyAppearance = appearance;
  document.getElementById("wg-root")?.shadowRoot?.getElementById("wg-ui")?.setAttribute("data-appearance", appearance);
}

/** A story: the app page, then `scene` paints the overlay on it. */
export function overlayStory(scene: (page: WgPage) => Promise<void>, title = "Equipment registry · add a machine") {
  return {
    render: () => appPage(),
    play: async (context: StoryContext) => {
      reset();
      await installOverlay(page, title, null, undefined, false);
      await scene(page);
      applyAppearance(context);
    },
  };
}

/** The box of the story page's button, to put a ring on. */
export function targetBox(): { x: number; y: number; width: number; height: number } {
  const r = document.getElementById("story-target")!.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
