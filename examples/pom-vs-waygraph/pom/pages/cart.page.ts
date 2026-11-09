import type { Locator, Page } from "@playwright/test";

/** The cart. */
export class CartPage {
  readonly items: Locator;

  constructor(private readonly page: Page) {
    this.items = page.locator('[data-test="inventory-item"]');
  }

  async checkout(): Promise<void> {
    await this.page.locator('[data-test="checkout"]').click();
  }
}
