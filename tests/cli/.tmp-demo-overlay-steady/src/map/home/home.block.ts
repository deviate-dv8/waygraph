import { checkpoint, defineMethodBlock, defineNavBlock, defineReadBlock, reads, Trait } from "waygraph";
export const Form = checkpoint("Form");
export const NavForm = defineNavBlock({ name: "nav-form", checkpoint: Form, url: "file:///home/dan/Desktop/Projects/waygraph/tests/cli/.tmp-demo-overlay-steady/index.html", verify: [Trait.visible("#title")] });
const fill = (name: string, sel: string, value: string) =>
  defineMethodBlock({
    name,
    from: Form,
    to: Form,
    screenshot: true,
    instruction: { async act(page) { await page.locator(sel).fill(value); }, verify: [Trait.value(sel, value)] },
  });
export const FillFirst = fill("fill-first", "#first", "Ada");
export const FillLast = fill("fill-last", "#last", "Lovelace");
export const Filled = reads("form")<{ count: number }>();
export const ReadForm = defineReadBlock({ name: "read-form", from: [Form], instruction: { read: (ctx) => Filled({ count: ctx.page.number("#count") }) } });
