// Collectors for the inventory: the products as the page lists them now (the rows `auto` and Pilot menus offer for a Method).
import type { Page, Locator } from "@playwright/test";
import { InventorySel, type InventoryItem } from "./_sel.js";

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
