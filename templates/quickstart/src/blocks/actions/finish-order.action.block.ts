import { defineBlock, checkpoint, Trait, narrate } from "waygraph";
import type { CheckoutInfoFilled, OrderComplete } from "../../states/quickstart.states.js";

export const FinishOrderBlock = defineBlock<CheckoutInfoFilled, OrderComplete>({
  name: "finish-order",
  description: "Places the order and confirms the 'Thank you for your order!' completion page.",
  instruction: {
    async act(page) {
      // narrate() captions an explicit action for a step-through overlay,
      // instead of it guessing a generic label from the element's own text.
      const finishButton = page.locator("#finish");
      await narrate(finishButton, "Placing the order", () => finishButton.click());
    },
    resolve: () => checkpoint("OrderComplete"),
    verify: [Trait.text(".complete-header", "Thank you for your order!")],
    highlights: () => [{ selector: ".complete-header", label: "remember this: order confirmed" }],
  },
});
