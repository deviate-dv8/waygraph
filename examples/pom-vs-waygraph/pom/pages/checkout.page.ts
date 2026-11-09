import type { Locator, Page } from "@playwright/test";

/** Checkout: the shipping form, the overview, the confirmation. */
export class CheckoutPage {
  readonly completeHeader: Locator;

  constructor(private readonly page: Page) {
    this.completeHeader = page.locator('[data-test="complete-header"]');
  }

  async fillInfo(firstName: string, lastName: string, postalCode: string): Promise<void> {
    await this.page.locator('[data-test="firstName"]').fill(firstName);
    await this.page.locator('[data-test="lastName"]').fill(lastName);
    await this.page.locator('[data-test="postalCode"]').fill(postalCode);
  }

  async continue(): Promise<void> {
    await this.page.locator('[data-test="continue"]').click();
  }

  async finish(): Promise<void> {
    await this.page.locator('[data-test="finish"]').click();
  }
}
