import { test, expect } from "@playwright/test";
import { Engine, MemPage, Trait, checkpoint, defineMethodBlock, defineNavBlock } from "waygraph";
import { applyUiChange } from "../ui-change.js";
import { LoginPage } from "../pom/pages/login.page.js";
import { InventoryPage } from "../pom/pages/inventory.page.js";
import { CartPage } from "../pom/pages/cart.page.js";
import { CheckoutPage } from "../pom/pages/checkout.page.js";

// Adopting waygraph one flow at a time: the page objects stay as they are, and each Block calls one of their methods.
// What the Blocks add is where each step lands (a Checkpoint) and a check that it got there and took effect (verify),
// so a failure stops at the step that broke, not at an assertion further on. The checks reuse the page objects too.
const SignIn = checkpoint("SignIn");
const Products = checkpoint("Products");
const Cart = checkpoint("Cart");
const Shipping = checkpoint("Shipping");
const Overview = checkpoint("Overview");
const Done = checkpoint("Done");

const OpenSignIn = defineNavBlock({ name: "open-sign-in", checkpoint: SignIn, url: "https://www.saucedemo.com/" });
const SignInBlock = defineMethodBlock({
  name: "sign-in",
  from: SignIn,
  to: Products,
  instruction: {
    act: (page) => new LoginPage(page).login("standard_user", "secret_sauce"),
    verify: [Trait.url({ pathname: "/inventory.html" })],
  },
});
const AddBackpack = defineMethodBlock({
  name: "add-backpack",
  from: Products,
  to: Products,
  instruction: {
    act: (page) => new InventoryPage(page).addToCart("sauce-labs-backpack"),
    verify: [{ name: "backpack-in-cart", wants: "the backpack in the cart", check: (page) => new InventoryPage(page).isInCart("sauce-labs-backpack") }],
  },
});
const OpenCart = defineMethodBlock({
  name: "open-cart",
  from: Products,
  to: Cart,
  instruction: { act: (page) => new InventoryPage(page).openCart(), verify: [Trait.url({ pathname: "/cart.html" })] },
});
const StartCheckout = defineMethodBlock({
  name: "start-checkout",
  from: Cart,
  to: Shipping,
  instruction: { act: (page) => new CartPage(page).checkout(), verify: [Trait.url({ pathname: "/checkout-step-one.html" })] },
});
// A page object method that fills three fields is one Block until it's split (waygraph check says so).
const FillShipping = defineMethodBlock({
  name: "fill-shipping",
  from: Shipping,
  to: Shipping,
  instruction: { act: (page) => new CheckoutPage(page).fillInfo("Ada", "Lovelace", "12345") },
});
const ContinueToOverview = defineMethodBlock({
  name: "continue-to-overview",
  from: Shipping,
  to: Overview,
  instruction: { act: (page) => new CheckoutPage(page).continue(), verify: [Trait.url({ pathname: "/checkout-step-two.html" })] },
});
const Finish = defineMethodBlock({
  name: "finish",
  from: Overview,
  to: Done,
  instruction: {
    act: (page) => new CheckoutPage(page).finish(),
    verify: [Trait.url({ pathname: "/checkout-complete.html" })],
  },
});

const checkoutFlow = new Engine()
  .map()
  .gotoPage(OpenSignIn)
  .method(SignInBlock)
  .method(AddBackpack)
  .method(OpenCart)
  .method(StartCheckout)
  .method(FillShipping)
  .method(ContinueToOverview)
  .method(Finish);

test("checkout: sign in, add the backpack, check out, the order is placed", async ({ context }) => {
  await applyUiChange(context);
  expect(await checkoutFlow.run(context, new MemPage())).toEqual(checkpoint("Done"));
});
