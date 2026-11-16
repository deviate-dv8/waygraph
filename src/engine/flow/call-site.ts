import { mark } from "../block/mark.js";
import { copyWaygraphRuntime } from "../block/block.js";
import type { SomeBlock } from "../block/some-block.js";

/** Where in a project's file a step was written: what Waygraph Studio shows beside the flow's code. */
export interface CallSite {
  file: string;
  line: number;
}

const OWN = /[\\/](?:waygraph[\\/](?:dist|src)|node_modules[\\/]waygraph)[\\/]/;

/** The first line of the stack that is the project's own: the flow file calling `.method(...)`. */
export function callSite(stack = new Error().stack): CallSite | undefined {
  for (const line of (stack ?? "").split("\n").slice(1)) {
    const found = /\(?((?:file:\/\/)?[^\s()]+?):(\d+):\d+\)?$/.exec(line.trim());
    const path = found?.[1];
    if (!found || path === undefined) continue;
    const file = path.replace(/^file:\/\//, "");
    if (OWN.test(file) || file.startsWith("node:")) continue;
    return { file, line: Number(found[2]) };
  }
  return undefined;
}

/** The step's Block with where it was written; a copy, since the Block itself is shared by every flow that uses it. */
export function writtenAt(block: SomeBlock, at: CallSite | undefined): SomeBlock {
  if (!at) return block;
  const next: SomeBlock = { ...block };
  copyWaygraphRuntime(block, next);
  mark(next, "__waygraphAt", at);
  return next;
}
