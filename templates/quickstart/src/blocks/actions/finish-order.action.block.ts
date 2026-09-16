import { defineBlock, checkpoint, Trait, narrate } from "waygraph";
import type { CheckoutOverviewPage, OrderComplete } from "../../states/checkout.states.js";

export const FinishOrderBlock = defineBlock<CheckoutOverviewPage, OrderComplete>({
  name: "finish-order",
  description: "Places the order and confirms the completion page.",
  instruction: {
    async act(page) {
      const finishButton = page.locator("#finish");
      await narrate(finishButton, "Placing the order", () => finishButton.click());
    },
    resolve: () => checkpoint("OrderComplete"),
    verify: [Trait.text(".complete-header", "Thank you for your order!")],
    highlights: () => [{ selector: ".complete-header", label: "remember this: order confirmed" }],
  },
});
