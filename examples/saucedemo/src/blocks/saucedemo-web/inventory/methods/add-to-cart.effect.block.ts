import { defineEffectBlock, checkpoint, type Checkpoint, type WaygraphInstanceOption } from "waygraph";
import type { StubCtx } from "waygraph";
import type { ItemInCart } from "../../../../states/checkout.states.js";
import { SelectedItem } from "../../../../states/checkout.mem-keys.js";
import { collectAddableItems, InventorySel } from "./inventory-items.js";

/** Showcase product for headed demos (matches shopFlow --data selectedItem). */
const DEMO_PRODUCT_ID = "sauce-labs-backpack";

/**
 * Kind: Effect
 * Helper: defineEffectBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Mutates cart for the mem-picked product. waygraph auto lists one
 * "Add ..." row per live Add button via instanceOptions.
 */
export const AddToCartBlock = defineEffectBlock<Checkpoint<string>, ItemInCart>({
  name: "add-to-cart",
  description: "Adds the item named by mem (saucedemo.selectedItem) to the cart.",
  requires: [SelectedItem.key],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(SelectedItem.key);
      await page.locator(InventorySel.addBtn(id)).click();
    },
    resolve: () => checkpoint("ItemInCart"),
    verify: [
      {
        name: "item-added-to-cart",
        async check(page, mem) {
          const { id } = mem.get(SelectedItem.key);
          return await page.locator(InventorySel.removeBtn(id)).first().isVisible();
        },
      },
    ],
    // Demo: zoom product -> add (stay zoomed), then badge after act.
    stubBefore: (ctx: StubCtx) => {
      ctx.title("Pick a product");
      ctx.todoId("saucedemo-cart");
      ctx.todos([
        { id: "cart-find", text: "Find the product" },
        { id: "cart-add", text: "Add to cart" },
        { id: "cart-open", text: "Open cart" },
      ]);
      ctx.todoIndex(0);
      ctx.zoom(1.35);
      ctx.zoomOut(false);
      ctx.highlights({
        product: {
          selector: InventorySel.title(DEMO_PRODUCT_ID),
          label: "Sauce Labs Backpack",
          detail: "Zoom the product",
          focus: true,
          color: "#c9a6ff",
          zoom: 1.45,
          zoomOut: false,
        },
        add: {
          selector: InventorySel.addBtn(DEMO_PRODUCT_ID),
          label: "Add to cart",
          focus: true,
          color: "#86efac",
          zoom: 1.5,
          zoomOut: false,
          weight: "bold",
        },
      });
    },
    stubAfter: (ctx: StubCtx) => {
      ctx.banner("In the cart");
      ctx.todoId("saucedemo-cart");
      ctx.todos([
        { id: "cart-find", text: "Find the product" },
        { id: "cart-add", text: "Add to cart" },
        { id: "cart-open", text: "Open cart" },
      ]);
      ctx.todoIndex(1);
      ctx.zoomOut(false);
      ctx.ring("badge", {
        selector: InventorySel.cartBadge,
        label: "Cart badge",
        detail: "Item count updated",
        focus: true,
        color: "#86efac",
        zoom: 1.6,
        zoomOut: false,
        duration: true,
      });
    },
  },
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const items = await collectAddableItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Add "${item.name}" to cart`,
      key: SelectedItem.key,
      value: item,
      highlight: InventorySel.addBtn(item.id),
    }));
  },
});
