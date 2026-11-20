import { Engine, checkpoint, defineNavBlock } from "waygraph";

const Page = checkpoint("Page");
const open = (name: string) => defineNavBlock({ name, checkpoint: Page, url: "data:text/html,<h1>ok</h1>" });
const engine = new Engine();

export const okFlow = engine.map({ labels: ["smoke"] }).gotoPage(open("open-ok"));
/** Needs an empty database: the config leaves its label out of the full run. */
export const dbFlow = engine.map({ labels: ["smoke", "empty-db"] }).gotoPage(open("open-db"));
/** No label at all: in every set that has no include. */
export const plainFlow = engine.map().gotoPage(open("open-plain"));
