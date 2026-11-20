import { test, expect } from "@playwright/test";
import { sel } from "../../src/index.js";

/** Each `sel.*` builder picks the same elements as the `page.getBy…` it mirrors, so a selector string and a Locator agree. */
test("a sel builder finds what the matching getBy finds", async ({ page }) => {
  await page.setContent(`
    <form id="login">
      <label for="u">User name</label><input id="u" data-testid="username" data-test="user-field" placeholder="Enter user" title="The user">
      <button type="submit">Login</button><button disabled>Login later</button>
      <input type="checkbox" id="r" checked><label for="r">Remember me</label>
    </form>
    <img alt="Company logo" src="data:,"><h2>Cart items</h2><p>Say "hi" today</p>`);
  const same = async (selector: string, locator: ReturnType<typeof page.locator>) => {
    expect(await page.locator(selector).count(), selector).toBe(await locator.count());
    expect(await page.locator(selector).count(), selector).toBeGreaterThan(0);
  };
  await same(sel.role("button", { name: "Login" }), page.getByRole("button", { name: "Login" }));
  await same(sel.role("button", { name: "Login", exact: true }), page.getByRole("button", { name: "Login", exact: true }));
  await same(sel.role("button", { disabled: true }), page.getByRole("button", { disabled: true }));
  await same(sel.role("checkbox", { name: "Remember me", checked: true }), page.getByRole("checkbox", { name: "Remember me", checked: true }));
  await same(sel.role("heading", { level: 2, name: /cart/i }), page.getByRole("heading", { level: 2, name: /cart/i }));
  await same(sel.testId("username"), page.getByTestId("username"));
  await same(sel.testId("user-field", { attribute: "data-test" }), page.locator('[data-test="user-field"]'));
  await same(sel.label("User name"), page.getByLabel("User name"));
  await same(sel.placeholder("enter user"), page.getByPlaceholder("enter user"));
  await same(sel.altText("Company logo"), page.getByAltText("Company logo"));
  await same(sel.title("The user", { exact: true }), page.getByTitle("The user", { exact: true }));
  await same(sel.text('Say "hi"'), page.getByText('Say "hi"'));
  await same(sel.text(/cart items/i), page.getByText(/cart items/i));
  await same(sel.within(sel.css("form#login"), sel.role("button", { name: "Login later" })), page.locator("form#login").getByRole("button", { name: "Login later" }));
});
