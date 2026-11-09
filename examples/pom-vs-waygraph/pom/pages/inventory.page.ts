import type { Locator, Page } from "@playwright/test";

/** The product list. */
export class InventoryPage {
  readonly cartBadge: Locator;

  constructor(private readonly page: Page) {
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
  }

  async addToCart(id: string): Promise<void> {
    await this.page.locator(`[data-test="add-to-cart-${id}"]`).click();
  }

  /** Whether the product shows Remove (it's in the cart). */
  async isInCart(id: string): Promise<boolean> {
    return this.page.locator(`[data-test="remove-${id}"]`).isVisible();
  }

  async openCart(): Promise<void> {
    await this.page.locator('[data-test="shopping-cart-link"]').click();
  }
}
