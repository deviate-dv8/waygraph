import type { StubCtx } from "waygraph";
import { CheckoutOverviewSel } from "../blocks/saucedemo-web/checkout-step-two/methods/checkout-overview.sel.js";

/** Yap slides after the order is placed. They play on the completion page, so they ring its header, not #finish. */
export function orderPlacedYap(ctx: StubCtx): void {
  ctx.slides([
    {
      caption: "Checkout is a short pipeline",
      detail: "Cart -> info -> overview -> done. You just placed the order.",
      tag: "YAP",
      tone: "info",
      duration: true,
    },
    {
      caption: "Completion page is the durable proof",
      detail: "tone: success - the thank-you header is what verify asserts on.",
      tag: "YAP",
      tone: "success",
      selector: CheckoutOverviewSel.completeHeader,
      duration: 2500,
      fastMode: 700,
    },
    {
      caption: "Episode continues after this yap",
      detail: "Next step rings the same banner, then you move on.",
      tag: "YAP",
      tone: "planned",
      selector: CheckoutOverviewSel.completeHeader,
      duration: true,
      fastMode: 500,
    },
  ]);
}
