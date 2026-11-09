import type { BrowserContext } from "@playwright/test";

/**
 * A change to the UI, played into every page before the app's own scripts run, the same for every suite:
 *
 * - `renamed-login`: the login button is rebuilt; its id and data-test change (a redesign, a component library swap).
 * - `broken-add`: "Add to cart" silently does nothing (a regression: the click handler is gone).
 *
 * `UI_CHANGE` names one; unset, the UI is as it is.
 */
export async function applyUiChange(context: BrowserContext): Promise<void> {
  const change = process.env.UI_CHANGE;
  if (!change) return;
  await context.addInitScript((name: string) => {
    if (name === "renamed-login") {
      const rename = () => {
        for (const button of document.querySelectorAll<HTMLElement>("#login-button, [data-test=login-button]")) {
          button.id = "sign-in";
          button.setAttribute("data-test", "sign-in");
        }
      };
      new MutationObserver(rename).observe(document, { subtree: true, childList: true });
    }
    if (name === "broken-add") {
      // Before the app sees it: a click on an Add to cart button never reaches its handler.
      window.addEventListener(
        "click",
        (event) => {
          const target = event.target as Element | null;
          if (target?.closest?.('[data-test^="add-to-cart"]')) {
            event.stopImmediatePropagation();
            event.preventDefault();
          }
        },
        true,
      );
    }
  }, change);
}
