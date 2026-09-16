import { Engine, start, end } from "waygraph";
import { LoadPageBlock } from "../blocks/load-page.block.js";

const engine = new Engine();

export const exampleFlow = engine.defineFlow([start, LoadPageBlock, end]);
