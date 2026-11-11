import { test, expect } from "@playwright/test";
import { Engine, MemPage, checkpoint, defineLayout, defineMethodBlock, defineNavBlock, Trait } from "../../src/index.js";
import { inRun, onRunEvent } from "../../src/engine/run/events.js";

const Shop = checkpoint("InterruptShop");
const engine = new Engine();
const NavShop = defineNavBlock({ name: "nav-interrupt-shop", checkpoint: Shop, url: "about:blank" });
// A banner covers the Buy button 300ms after the page loads; the layout knows how to dismiss it.
defineLayout({
  name: "interrupt-shell",
  interrupts: { cookies: { when: "#cookies", do: async (page) => void (await page.locator("#cookies button").click()) } },
});
const Buy = defineMethodBlock({
  name: "interrupt-buy",
  from: Shop,
  to: Shop,
  instruction: {
    async act(page) {
      await page.setContent(`<button id="buy" onclick="this.textContent='bought'">Buy</button>
        <div id="cookies" style="position:fixed;inset:0;background:#fff"><button onclick="this.parentElement.remove()">Accept</button></div>`);
      await page.locator("#buy").click();
    },
    verify: [Trait.text("#buy", "bought")],
  },
});

test("an interrupt of a layout is handled where it shows up, and the run says so", async ({ context, page }) => {
  const events: { type: string; name?: string; layout?: string }[] = [];
  const off = onRunEvent((e) => events.push(e as never));
  try {
    await inRun("interrupts", () => engine.map().gotoPage(NavShop).method(Buy).run(context, new MemPage(), { page }));
  } finally {
    off();
  }
  expect(events.find((e) => e.type === "interrupt")).toMatchObject({ layout: "interrupt-shell", name: "cookies" });
});
