/** Product slug and display name, as the inventory, the detail page and the cart show them. */
export type InventoryItem = { id: string; name: string };

/** The inventory page (`/inventory.html`): static strings and per-product factories. */
export const InventorySel = {
  list: ".inventory_list",
  card: ".inventory_item",
  name: ".inventory_item_name",
  detailName: ".inventory_details_name",
  cartItem: ".cart_item",
  cartBadge: ".shopping_cart_badge",
  addBtn: (id: string) => `[data-test="add-to-cart-${id}"]`,
  removeBtn: (id: string) => `[data-test="remove-${id}"]`,
  addBtnPrefix: 'button[data-test^="add-to-cart-"]',
  removeBtnPrefix: 'button[data-test^="remove-"]',
  title: (id: string) =>
    `div.inventory_item:has(button[data-test="add-to-cart-${id}"], button[data-test="remove-${id}"]) ` +
    `.inventory_item_name`,
};
