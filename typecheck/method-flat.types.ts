// A Method written flat: act, precondition, verify and lands on the Method itself.
import { defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { Trait } from "../src/engine/trait/trait.js";

const Form = checkpoint("FlatForm");
const Saved = checkpoint("FlatSaved");
const Refused = checkpoint("FlatRefused");

export const Fill = defineMethodBlock({ name: "flat-fill", from: Form, to: Form, async act(page) { await page.locator("input").fill("x"); }, verify: [Trait.visible("input")] });

// More than one `to`: lands says which, and may only name one of them.
export const Submit = defineMethodBlock({
  name: "flat-submit",
  from: Form,
  to: [Saved, Refused],
  async act() {},
  async lands(page) {
    return (await page.locator(".error").count()) ? Refused : Saved;
  },
});

// @ts-expect-error - a Method does something: act (or the deprecated instruction) is required
export const Nothing = defineMethodBlock({ name: "flat-nothing", from: Form, to: Form });

export const WrongLand = defineMethodBlock({
  name: "flat-wrong",
  from: Form,
  to: Saved,
  async act() {},
  // @ts-expect-error - it lands on Saved, not Refused
  async lands() {
    return Refused;
  },
});
