import { test, expect } from "@playwright/test";
import type { Checkpoint } from "../../src/index.js";
import { Engine, start, end, checkpoint, defineBlock, defineNavBlock, Trait, MemPage, key } from "../../src/index.js";

// Proves a real gap-turned-non-gap: a Block whose action doesn't move to a
// new page state at all (clicking "+" to bump a cart item's quantity, say)
// has In === Out, the SAME Checkpoint tag - defineFlow already accepts that
// with zero special-casing (see "chains the same Checkpoint back into
// itself" below). The real question this was raised over: how do you VERIFY
// the increment actually landed correctly, when the only thing that changed
// is a number, not the page you're on? Trait.check already takes (page, mem)
// - not just page - so a bespoke Trait can compare what's on the page
// against what mem expects. This was already true in the engine; it just
// had no test proving it and no doc mentioning it.

type ProductPage = Checkpoint<"ProductPage">;

const Quantity = key<number>("test.quantity");

const PRODUCT_PAGE_HTML = `<!doctype html><html><body>
  <div id="qty">0</div>
  <button id="inc">+</button>
  <script>
    document.getElementById("inc").onclick = () => {
      const el = document.getElementById("qty");
      el.textContent = String(Number(el.textContent) + 1);
    };
  </script>
</body></html>`;
const PRODUCT_PAGE_URL = `data:text/html,${encodeURIComponent(PRODUCT_PAGE_HTML)}`;

function makeIncrementBlock(name: string, reallyClick: boolean) {
  return defineBlock<ProductPage, ProductPage>({
    name,
    requires: [Quantity],
    instruction: {
      async act(page, _input, mem) {
        if (reallyClick) await page.locator("#inc").click();
        mem.set(Quantity, mem.get(Quantity) + 1);
      },
      resolve: () => checkpoint("ProductPage"),
      verify: [
        {
          // A bespoke Trait, not a built-in factory - the check itself reads
          // mem, not just the page, to know what value is actually expected.
          name: "quantity-matches-mem",
          async check(page, mem) {
            const shown = await page.locator("#qty").textContent();
            return shown === String(mem.get(Quantity));
          },
        },
      ],
    },
  });
}

const incrementQuantity = makeIncrementBlock("increment-quantity", true);

// A real nav Block first, exactly like a real product page - a Flow's first
// real Block still needs to accept __start__; the increment Blocks
// themselves only ever move ProductPage -> ProductPage, same Checkpoint in
// and out.
const navProduct = defineNavBlock<ProductPage>({
  name: "nav-product",
  checkpoint: "ProductPage",
  url: PRODUCT_PAGE_URL,
  verify: [Trait.visible("#inc")],
});

test.describe("same-checkpoint Blocks verifying against mem", () => {
  test("a Block chains back into its own Checkpoint - no special-casing needed", () => {
    const engine = new Engine();
    // In === Out (both "ProductPage") for every increment slot here -
    // defineFlow's own type constraint is just "next Block's In === prior
    // Block's Out," trivially satisfied when they're literally the same
    // tag. This is a compile-time proof as much as a runtime one: if this
    // didn't typecheck, `tsc --noEmit` would already have failed.
    const flow = engine.defineFlow([start, navProduct, incrementQuantity, incrementQuantity, incrementQuantity, end]);
    expect(flow.blocks().map((b) => b.name)).toEqual([
      "nav-product",
      "increment-quantity",
      "increment-quantity",
      "increment-quantity",
    ]);
  });

  test("verify reads mem, not just the page - confirms three real clicks landed the exact expected quantity", async ({
    page,
  }) => {
    const mem = new MemPage();
    mem.set(Quantity, 0);

    const engine = new Engine();
    const flow = engine.defineFlow([start, navProduct, incrementQuantity, incrementQuantity, incrementQuantity, end]);
    const fakeContext = { newPage: async () => page } as any;
    const outcome = await flow.run(fakeContext, mem, { page, closeOnFinish: false });

    expect(outcome.result).toEqual(checkpoint("ProductPage"));
    expect(mem.get(Quantity)).toBe(3);
    await expect(page.locator("#qty")).toHaveText("3");
  });

  test("a mem-aware verify Trait genuinely fails when the page and mem disagree - not a trivial always-pass", async ({
    page,
  }) => {
    const mem = new MemPage();
    mem.set(Quantity, 0);

    // reallyClick: false simulates a broken act() - mem says "incremented,"
    // the page never actually moved. A verify Trait that only checked "does
    // #qty show a number" would pass this by accident; one that compares
    // against mem catches the real mismatch.
    const brokenIncrement = makeIncrementBlock("increment-quantity-broken", false);
    const engine = new Engine();
    const flow = engine.defineFlow([start, navProduct, brokenIncrement, end]);
    const fakeContext = { newPage: async () => page } as any;

    await expect(flow.run(fakeContext, mem, { page, closeOnFinish: false })).rejects.toThrow(
      /quantity-matches-mem/,
    );
  });
});
