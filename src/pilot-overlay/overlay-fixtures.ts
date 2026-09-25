import { runStubPhase } from "../highlights.js";
import type { StubCtx, StubPhaseResult } from "../highlights.js";
import type { PilotHighlightFixtures } from "./fixtures.js";

/**
 * Resolve agent-sent "waygraph overlay fixtures" (`auto highlight` JSON / shorthand) through the SAME
 * stub-ctx path a Block's `stubBefore(ctx)` uses, so ctx.todos / ctx.device / ctx.title / ctx.bannerUi semantics
 * (keep vs set vs clear, defaults, normalisation) cannot diverge between `waygraph demo` and pilot/auto/browser.
 * Not Playwright test fixtures - these describe what the waygraph overlay paints on the page under test.
 */
export async function overlayFixturesToPhase(f: PilotHighlightFixtures): Promise<StubPhaseResult> {
  const lifecycle = (ctx: StubCtx): void => {
    if (f.clear) {
      ctx.hideTodos();
      ctx.hideDevice();
      return;
    }
    if (f.title !== undefined) ctx.title(f.title, f.titlePos ? { pos: f.titlePos } : undefined);
    else if (f.titlePos) ctx.titlePos(f.titlePos);
    if (f.bannerUi) ctx.bannerUi(f.bannerUi);
    if (f.todos !== undefined) {
      ctx.todos("pilot", f.todos, {
        title: f.todoTitle ?? "Plan",
        index: f.todoIndex ?? 0,
        pos: f.todoPos === "left" ? "left" : "right",
      });
    }
    const ui = f.todoDockUi ?? f.todoUi;
    if (ui) ctx.todoDockUi(ui);
    if (f.device) ctx.device(f.device);
    if (typeof f.zoom === "number" && Number.isFinite(f.zoom) && f.zoom > 0) ctx.zoom(f.zoom);
    if (f.zoomOut !== undefined) ctx.zoomOut(f.zoomOut);
    if (f.rings?.length) {
      f.rings.forEach((r, i) => {
        const { selector, label, ...rest } = r;
        ctx.ring(`ring${i + 1}`, { selector, label, ...(rest as object) });
      });
    }
  };
  return runStubPhase({ name: "overlay-fixtures", stubBefore: lifecycle } as never, "stubBefore");
}
