import type { PageHandle, Trait } from "waygraph";
import { HomePage } from "../_page.block.js";
import { DemoSel } from "../_sel.js";

export const clearCart = (self: PageHandle<"Home">) =>
  self.method({
    name: "clear-cart",
    description: "Clears every item via the Clear cart control.",
    async act(page) {
      await page.locator(DemoSel.clear).click();
    },
    verify: (): Trait[] => [HomePage.read.cartCount.is(0)],
  });
