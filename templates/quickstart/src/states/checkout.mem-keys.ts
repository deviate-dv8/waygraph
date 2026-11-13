import { keys, state } from "waygraph";

export const SaucedemoKeys = keys("saucedemo")<{
  credentials: { username: string; password: string };
  /**
   * Which product `add-to-cart` should click - `id` is the saucedemo slug
   * (e.g. "sauce-labs-backpack", matching `data-test="add-to-cart-<id>"` /
   * `data-test="remove-<id>"`), `name` is only for display. `waygraph auto`
   * fills this itself (one menu row per live item, via `AddToCartBlock`'s
   * `instanceOptions`) - a hand-written flow sets it explicitly instead.
   */
  selectedItem: { id: string; name: string };
  /** A state: the shop is signed in. Pages after the login need it; a good login sets it, logging out clears it. */
  signedIn: boolean;
}>({
  signedIn: state(false),
  credentials: () => ({
    username: "standard_user",
    password: "secret_sauce",
  }),
  selectedItem: () => ({
    id: "sauce-labs-backpack",
    name: "Sauce Labs Backpack",
  })
});
