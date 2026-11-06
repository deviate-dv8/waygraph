// A step's outcome card, Node side: what the step's expectations did and what the page now shows that changed, painted as
// the card (overlay/inpage/outcome.ts) and kept as a piece of the page's overlay layer, so a page load brings it back.
import { envFlag } from "../../engine/env.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import type { ExpectResult } from "../../engine/run/expect.js";
import { hideOutcome, showOutcome, tickOutcome, type OutcomeCard } from "../overlay/inpage/outcome.js";
import { overlayLayer, type StoredPiece } from "../overlay/overlay-layer.js";
import type { WgPage } from "../types.js";
import { demoLog } from "./demo-log.js";
import type { ReadChange } from "./last-read.js";
import type { StepperContext } from "./view.js";

const quiet = () => envFlag("WAYGRAPH_JSON");

/** At most this many changed values on the card; the rest are in the step panel's read. */
const MAX_CHANGES = 5;

/** How the step went, on a card that shows whether the panel is open: its expectations ticked in turn, then what changed. */
export async function showOutcomeCard(ctx: StepperContext, expects: readonly ExpectResult[], changes: readonly ReadChange[]): Promise<void> {
  if (!quiet()) {
    for (const e of expects) demoLog(`  expected ${e.ok ? "ok" : "FAILED"}: ${e.text}${e.ok || !e.saw ? "" : ` (saw ${e.saw})`}`);
    for (const c of changes) demoLog(`  now shows ${c.key}: ${c.from} -> ${c.to}`);
  }
  if (expects.length === 0 && changes.length === 0) return;
  const card = {
    expects: expects.map((e) => ({ text: e.text, ok: e.ok, ...(e.saw ? { saw: e.saw } : {}) })),
    changes: changes.slice(0, MAX_CHANGES),
    moreChanges: Math.max(0, changes.length - MAX_CHANGES),
  };
  await ctx.page.evaluate(showOutcome, card).catch(ignorePageGone);
  // A page load before the next step brings it back, every row ticked.
  outcomePiece(ctx.page).remember(card);
  const beat = ctx.pacing.gatesFast ? 120 : 450;
  for (const [i] of expects.entries()) {
    await new Promise((r) => setTimeout(r, beat));
    await ctx.page.evaluate(tickOutcome, i).catch(ignorePageGone);
  }
}

/** The step's outcome card on this page, a piece of the overlay layer: it outlives a page load until the next step. */
export const outcomePiece = (page: WgPage): StoredPiece<OutcomeCard> =>
  overlayLayer(page).stored<OutcomeCard>(
    "outcome",
    async (p, card) => {
      await p.evaluate(showOutcome, card);
      for (const [i] of card.expects.entries()) await p.evaluate(tickOutcome, i);
    },
    (p) => p.evaluate(hideOutcome),
  );
