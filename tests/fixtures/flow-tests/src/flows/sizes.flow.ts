import { Engine, checkpoint, defineNavBlock, type Trait } from "waygraph";

const Page = checkpoint("Page");
const width = (w: number): Trait => ({ name: `width-${w}`, wants: `${w}px wide`, async check(page) { const got = await page.evaluate(() => innerWidth); return { ok: got === w, saw: `${got}px` }; } });
const open = (name: string) => defineNavBlock({ name, checkpoint: Page, url: "data:text/html,<h1>ok</h1>" });
const engine = new Engine();

/** Plays at its own size. */
export const wideFlow = engine.map({ viewport: { width: 1500, height: 800 } }).gotoPage(open("open-wide").withVerify([width(1500)])).end();
/** Plays alone, after the others. */
export const aloneFlow = engine.map({ exclusive: true }).gotoPage(open("open-alone")).end();
export const otherFlow = engine.map().gotoPage(open("open-other")).end();
