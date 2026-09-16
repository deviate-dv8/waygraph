import { keyGroup } from "waygraph";

export const LoginCreds = keyGroup<{ username: string; password: string }>("saucedemo.credentials");

/**
 * Which product `add-to-cart` should click - `id` is the saucedemo slug
 * (e.g. "sauce-labs-backpack", matching `data-test="add-to-cart-<id>"` /
 * `data-test="remove-<id>"`), `name` is only for display. `waygraph auto`
 * fills this itself (one menu row per live item, via `AddToCartBlock`'s
 * `instanceOptions`) - a hand-written flow sets it explicitly instead.
 */
export const SelectedItem = keyGroup<{ id: string; name: string }>("saucedemo.selectedItem");
