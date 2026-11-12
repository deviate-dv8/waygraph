# Page objects and waygraph

Waygraph is a page object model; a page object model isn't waygraph. Both put what a page offers in one place, so a
test reads as steps and a selector changes in one file. Waygraph fixes the rest: where each thing goes, what it's
called, where every step lands and how it proves it got there. You define only what's needed, in the place the
convention gives it, and an agent or a new teammate follows the same convention instead of inventing names.

## The same parts

| A page object suite has | Waygraph has |
|---|---|
| a class per page (`LoginPage`) | a [Page Block](./guides/blocks#page-blocks) per page: `LoginPage.nav` opens it, `LoginPage.do.*` is what you can do there, `LoginPage.expects.*` what a scenario can expect |
| methods on the class (`login(user, pass)`) | [Blocks](./guides/blocks), one action each (`fill-username`, `fill-password`, `submit-login`), in the page's folder |
| locators in the class | a `_sel.ts` beside the page's Blocks |
| assertions at the end of the test | `verify` on every Block (it arrived and took effect, in every flow), and `expect` on a step (what this scenario expects) |
| test data in the test | typed [mem keys](./guides/data), with stubs for runs that don't care |
| a test reads a value off the page | the page's [`read`](./guides/reads): what it shows, as typed data, read after every step |
| the test is a function calling methods | a [flow](./guides/flows): `map().gotoPage(LoginPage.nav).method(LoginPage.do.submitLogin)…`, which TypeScript checks never skips between pages |

What the fixed parts buy, past the page object:

- **Every step checks itself.** A step that didn't take effect stops there, saying what it wanted and what the page
  showed, not at an assertion further on.
- **A place for everything.** A folder per page (`src/map/(app_base)/platform/lines/`), a file per kind (`_nav.block.ts`,
  `_methods/*.method.block.ts`, `_sel.ts`, `_read.block.ts`): nothing to decide, nothing to name twice. `waygraph check`
  says when something isn't where it goes.
- **The same Blocks do more than test.** The [demo](./guides/demo) plays a flow for a person to watch; `waygraph auto`
  and Pilot let an agent explore the app with them; [Waygraph Studio](./guides/studio) draws the site map from them.

## Side by side

`examples/pom-vs-waygraph` plays the same Sauce Demo checkout three ways: as page objects written the usual way
(actions in the classes, assertions in the test), as waygraph (the saucedemo example's flow), and as waygraph Blocks
that call the page objects' methods. Then it changes the UI under all three, the same way, and records where each
stopped (`npm run compare` there; headless, against www.saucedemo.com).

| UI change | Page objects | waygraph | Blocks wrapping the page objects |
|---|---|---|---|
| none | passes | passes | passes |
| the login button is rebuilt (its id and data-test change) | fails in `LoginPage.login`: `locator.click: Timeout` | fails at the first step on the sign-in page: `visible(#login-button)` | fails at `sign-in`: `act of "sign-in" failed: locator.click: Timeout` |
| "Add to cart" silently does nothing | fails one step later, at the cart's `toHaveCount(1)`: expected 1 | fails at `add-to-cart`: wanted the item in the cart; saw the catalogue with `inCart: false` | fails at `add-backpack`: wanted the backpack in the cart |

A renamed selector breaks each style once, in one place: page objects keep selectors in one place too. The
difference is a feature that broke: the page objects find out at the next assertion, which says a count was wrong; the
Blocks stop at the step that broke and say what the page showed.

## Adopting it one flow at a time

A team with page objects doesn't rewrite them. A Block can call a page object's method as it is; what the Block adds is
where the step lands (a Checkpoint) and the check that it got there (verify). Start with one flow:

```ts
import { defineMethodBlock, Trait } from "waygraph";
import { LoginPage } from "../pages/login.page.js";       // the page object, unchanged

export const SignInBlock = defineMethodBlock({
  name: "sign-in",
  from: SignIn,
  to: Products,
  act: (page) => new LoginPage(page).login("standard_user", "secret_sauce"),
  verify: [Trait.url({ pathname: "/inventory.html" })],
});
```

The checks can reuse the page objects too (`check: (page) => new InventoryPage(page).isInCart(id)`). From there, one
page at a time: split a method that does several things into one-action Blocks (`waygraph check` names them), move its
locators to the page's `_sel.ts`, and say what the page shows in its `read`.
