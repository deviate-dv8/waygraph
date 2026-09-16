import type { Page, Locator } from "@playwright/test";

/** Product slug + display name (saucedemo inventory / detail / cart). */
export type InventoryItem = { id: string; name: string };

async function readItemName(page: Page, button: Locator, id: string): Promise<string> {
  const card = button.locator("xpath=ancestor::div[contains(@class,'inventory_item')][1]");
  if ((await card.count()) > 0) {
    const text = await card.locator(".inventory_item_name").first().textContent().catch(() => null);
    if (text?.trim()) return text.trim();
  }
  const cartRow = button.locator("xpath=ancestor::div[contains(@class,'cart_item')][1]");
  if ((await cartRow.count()) > 0) {
    const text = await cartRow.locator(".inventory_item_name").first().textContent().catch(() => null);
    if (text?.trim()) return text.trim();
  }
  const detailName = await page.locator(".inventory_details_name").first().textContent().catch(() => null);
  if (detailName?.trim()) return detailName.trim();
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function collectByPrefix(page: Page, prefix: "add-to-cart-" | "remove-"): Promise<InventoryItem[]> {
  const buttons = page.locator(`button[data-test^="${prefix}"]`);
  const count = await buttons.count();
  const items: InventoryItem[] = [];
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const testId = await button.getAttribute("data-test");
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
  const cards = page.locator(".inventory_item");
  const count = await cards.count();
  const items: InventoryItem[] = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const addTest = await card.locator('button[data-test^="add-to-cart-"]').first().getAttribute("data-test").catch(() => null);
    const removeTest = await card
      .locator('button[data-test^="remove-"]')
      .first()
      .getAttribute("data-test")
      .catch(() => null);
    const id =
      addTest?.replace(/^add-to-cart-/, "") ?? removeTest?.replace(/^remove-/, "") ?? null;
    if (!id) continue;
    const name =
      (await card.locator(".inventory_item_name").first().textContent().catch(() => null))?.trim() ??
      id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ id, name });
  }
  return items;
}

/** Click the product title link inside the card that owns this item id. */
export function inventoryItemTitleSelector(id: string): string {
  return (
    `div.inventory_item:has(button[data-test="add-to-cart-${id}"], button[data-test="remove-${id}"]) ` +
    `.inventory_item_name`
  );
}
