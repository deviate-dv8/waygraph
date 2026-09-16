import type { Page, Locator } from "@playwright/test";

/**
 * Kind: helper (not a Block)
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * DOM selectors + collectors for Effect / MemNav instanceOptions. Discovery
 * ignores this file (no *.block.ts suffix). InventorySel = strings only;
 * collectors use Sel to spawn auto menu rows.
 */

/** Product slug + display name (saucedemo inventory / detail / cart). */
export type InventoryItem = { id: string; name: string };

/** DOM selectors for this screen - static strings + per-id factories. */
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

async function readItemName(page: Page, button: Locator, id: string): Promise<string> {
  const card = button.locator("xpath=ancestor::div[contains(@class,'inventory_item')][1]");
  if ((await card.count()) > 0) {
    const text = await card.locator(InventorySel.name).first().textContent({ timeout: 500 }).catch(() => null);
    if (text?.trim()) return text.trim();
  }
  const cartRow = button.locator("xpath=ancestor::div[contains(@class,'cart_item')][1]");
  if ((await cartRow.count()) > 0) {
    const text = await cartRow.locator(InventorySel.name).first().textContent({ timeout: 500 }).catch(() => null);
    if (text?.trim()) return text.trim();
  }
  const detailName = await page.locator(InventorySel.detailName).first().textContent({ timeout: 500 }).catch(() => null);
  if (detailName?.trim()) return detailName.trim();
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function collectByPrefix(page: Page, prefix: "add-to-cart-" | "remove-"): Promise<InventoryItem[]> {
  const buttons = page.locator(`button[data-test^="${prefix}"]`);
  const count = await buttons.count();
  const items: InventoryItem[] = [];
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const testId = await button.getAttribute("data-test", { timeout: 500 }).catch(() => null);
    const id = testId?.replace(new RegExp(`^${prefix}`), "");
    if (!id) continue;
    items.push({ id, name: await readItemName(page, button, id) });
  }
  return items;
}

/** Products still showing "Add to cart" on this page. */
export function collectAddableItems(page: Page): Promise<InventoryItem[]> {
  return collectByPrefix(page, "add-to-cart-");
}

/** Products already in the cart (showing "Remove" on this page). */
export function collectRemovableItems(page: Page): Promise<InventoryItem[]> {
  return collectByPrefix(page, "remove-");
}

/**
 * Every product card on the inventory list (whether Add or Remove is showing).
 * Used by MemNavBlock (open item details) - not filtered by cart state.
 */
export async function collectInventoryItems(page: Page): Promise<InventoryItem[]> {
  const cards = page.locator(InventorySel.card);
  const count = await cards.count();
  const items: InventoryItem[] = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    // count() first - getAttribute on a missing locator waits the full default timeout.
    const addLoc = card.locator(InventorySel.addBtnPrefix);
    const removeLoc = card.locator(InventorySel.removeBtnPrefix);
    const addTest =
      (await addLoc.count()) > 0
        ? await addLoc.first().getAttribute("data-test", { timeout: 500 }).catch(() => null)
        : null;
    const removeTest =
      (await removeLoc.count()) > 0
        ? await removeLoc.first().getAttribute("data-test", { timeout: 500 }).catch(() => null)
        : null;
    const id =
      addTest?.replace(/^add-to-cart-/, "") ?? removeTest?.replace(/^remove-/, "") ?? null;
    if (!id) continue;
    const name =
      (await card.locator(InventorySel.name).first().textContent({ timeout: 500 }).catch(() => null))?.trim() ??
      id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ id, name });
  }
  return items;
}

/** @deprecated Prefer {@link InventorySel.title} */
export function inventoryItemTitleSelector(id: string): string {
  return InventorySel.title(id);
}
