import { test, expect } from "@playwright/test";
import type { Checkpoint, MemKey } from "../../src/index.js";
import {
  Engine,
  start,
  end,
  MemPage,
  checkpoint,
  chainFlow,
  withSessionReset,
  withTitle,
  defineNavBlock,
  defineBlock,
  Trait,
  keyGroup,
} from "../../src/index.js";

// THE flagship multi-episode example, living in waygraph's own repo, not a
// downstream consumer project - real saucedemo.com, not a synthetic fixture.
// No human demonstrates a browser-automation library against a fake page
// they hand-rolled; this is the same site waygraph's own `waygraph try`
// quickstart already drives (templates/quickstart/), so it's a real,
// recognizable app, not a toy.
//
// Two genuinely different scenarios, not the same steps split in half: the
// Owner logs in, adds an item to the cart, and browses back to the product
// list - via nav-cart and nav-continue-shopping, both CLICK-based NavBlocks
// (the real "Cart" link and "Continue Shopping" button), never a url
// teleport once already inside the app. The Viewer then attempts the exact
// same login with an account saucedemo.com itself genuinely blocks.

type LoginPage = Checkpoint<"LoginPage">;
type LoggedIn = Checkpoint<"LoggedIn">;
type ItemInCart = Checkpoint<"ItemInCart">;
type CartPage = Checkpoint<"CartPage">;

const OwnerCreds = keyGroup<{ username: string; password: string }>("example.owner-creds");
const ViewerCreds = keyGroup<{ username: string; password: string }>("example.viewer-creds");

// The app's own entry point - no click path exists to get here from
// nowhere, so url is the right call, not an escape hatch.
const navLogin = defineNavBlock<LoginPage>({
  name: "nav-login",
  checkpoint: "LoginPage",
  // Absolute, not "/" - these Flows run via the no-context Engine.run(mem)
  // overload (this file's own tests, no Playwright baseURL config involved),
  // so a relative URL has nothing to resolve against.
  url: "https://www.saucedemo.com/",
  verify: [Trait.visible("#login-button")],
});

function makeSubmitLogin(name: string, credsKey: MemKey<{ username: string; password: string }>) {
  return defineBlock<LoginPage, LoggedIn>({
    name,
    requires: [credsKey],
    instruction: {
      async act(page, _input, mem) {
        const { username, password } = mem.get(credsKey);
        await page.locator("#user-name").fill(username);
        await page.locator("#password").fill(password);
        await page.locator("#login-button").click();
      },
      resolve: () => checkpoint("LoggedIn"),
      verify: [Trait.url({ pathname: "/inventory.html" })],
    },
  });
}

const ownerLogin = makeSubmitLogin("owner-login", OwnerCreds.key);

// locked_out_user never reaches /inventory.html - Trait.url's default
// page.waitForURL() has no timeout override, so it would hang instead of
// failing. A bounded version of the same check still fails (correctly),
// just in 5s instead of forever.
const viewerLoginAttempt = makeSubmitLogin("viewer-login", ViewerCreds.key).withVerify([
  {
    name: "reached-inventory-or-genuinely-blocked",
    async check(page) {
      try {
        await page.waitForURL(/\/inventory\.html/, { timeout: 5_000 });
        return true;
      } catch {
        return false;
      }
    },
  },
]);

const addToCart = defineBlock<LoggedIn, ItemInCart>({
  name: "add-to-cart",
  instruction: {
    async act(page) {
      await page.locator("#add-to-cart-sauce-labs-backpack").click();
    },
    resolve: () => checkpoint("ItemInCart"),
    verify: [Trait.text(".shopping_cart_badge", "1")],
  },
});

// Click-based, not url - a real click on the app's own "Cart" link.
const navCart = defineNavBlock<CartPage>({
  name: "nav-cart",
  checkpoint: "CartPage",
  click: ".shopping_cart_link",
  verify: [Trait.url({ pathname: "/cart.html" })],
});

// Click-based, not url - the cart page's own real "Continue Shopping" button.
const navContinueShopping = defineNavBlock<LoggedIn>({
  name: "nav-continue-shopping",
  checkpoint: "LoggedIn",
  click: "#continue-shopping",
  verify: [Trait.url({ pathname: "/inventory.html" })],
});

const engine = new Engine();

// Explicit type args - navContinueShopping's Out is LoggedIn, the same tag
// ownerLogin's Out already used earlier in this same array, which trips
// defineFlow's own overload inference; pinning B..F sidesteps it (same
// fix saucedemo's checkout.flow.ts needed for its own repeated tag).
const ownerFlow = withTitle(
  withSessionReset(
    engine.defineFlow<LoginPage, LoggedIn, ItemInCart, CartPage, LoggedIn>([
      start,
      navLogin,
      ownerLogin,
      addToCart,
      navCart,
      navContinueShopping,
      end,
    ]),
  ),
  "Owner: Shops, then browses again",
);
const viewerBlockedFlow = withTitle(
  withSessionReset(engine.defineFlow([start, navLogin, viewerLoginAttempt, end])),
  "Viewer: Blocked Login Attempt",
);

test.describe("chainFlow - a real 2-episode example (saucedemo.com)", () => {
  test("episode 1 alone: the Owner shops, then browses again via click-based navigation", async () => {
    const mem = new MemPage();
    mem.set(OwnerCreds({ username: "standard_user", password: "secret_sauce" }));

    const result = await ownerFlow.run(mem);

    expect(result).toEqual(checkpoint("LoggedIn"));
  });

  test("episode 2 alone: a locked-out Viewer's identical login attempt genuinely fails", async () => {
    const mem = new MemPage();
    mem.set(ViewerCreds({ username: "locked_out_user", password: "secret_sauce" }));

    await expect(viewerBlockedFlow.run(mem)).rejects.toThrow(/viewer-login/);
  });

  test("chained together: Owner succeeds first, then the Viewer's attempt genuinely fails - not a silent pass, not a mem clobber", async () => {
    const mem = new MemPage();
    mem.set(OwnerCreds({ username: "standard_user", password: "secret_sauce" }));
    mem.set(ViewerCreds({ username: "locked_out_user", password: "secret_sauce" }));

    const combined = chainFlow(ownerFlow, viewerBlockedFlow);

    await expect(combined.run(mem)).rejects.toThrow(/viewer-login/);
    // Blocked on the SECOND episode's own login attempt, not the first -
    // proves the chain actually reached episode 2 at all.
  });

  test("episode titles survive chaining, and the flattened chain includes the click-based NavBlocks", () => {
    expect(ownerFlow.title).toBe("Owner: Shops, then browses again");
    expect(viewerBlockedFlow.title).toBe("Viewer: Blocked Login Attempt");

    const info = chainFlow(ownerFlow, viewerBlockedFlow).blocks();
    expect(info.map((bi) => bi.name)).toEqual([
      "nav-login",
      "owner-login",
      "add-to-cart",
      "nav-cart",
      "nav-continue-shopping",
      "nav-login",
      "viewer-login",
    ]);
    // No reset before the very first flow (nothing to reset yet) - one
    // right before the Viewer episode's own first Block.
    expect(info[0]!.resetSessionBefore).toBeUndefined();
    expect(info[5]!.resetSessionBefore).toBe(true);
  });
});
