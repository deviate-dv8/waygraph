// `waygraph check`: Checkpoints that are a state of a page, not a page. A Checkpoint is a place the app can be: a page,
// with its own address. What changed on a page (an item in the cart, a link sent, an alert shown) is what the page
// shows - a Read Block's field, checked in verify or expected - not another Checkpoint.
import type { Manifest } from "../manifest/manifest.js";

/** A Checkpoint that looks like a state of a page. */
export interface StatePage {
  checkpoint: string;
  /** No address of its own, and only Methods land on it. */
  reachedBy?: string[];
  /** Its address is another Checkpoint's, which it shares it with. */
  sharesWith?: { page: string; address: string };
}

/** A url's path: an absolute url without its origin, a path as it is; the query and hash dropped. */
const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/)[0] || "/";
  }
};

/**
 * The Checkpoints nothing starts from that either have no address of their own and are landed on only by Methods (a
 * step that changed something on the page it was on), or have only addresses another Checkpoint has (the same page).
 * A page with an address of its own is a page even when nothing starts from it (an order's confirmation).
 */
export function findStatePages(manifest: Manifest): StatePage[] {
  const steps = manifest.blocks.filter((b) => b.kind !== "expect");
  const paths = new Map(manifest.checkpoints.map((c) => [c, [...new Set((manifest.pageUrls[c] ?? []).map(pathOf))]]));
  const found: StatePage[] = [];
  for (const checkpoint of manifest.checkpoints) {
    if (checkpoint === "__start__") continue;
    if (steps.some((b) => b.from.includes(checkpoint))) continue;
    const mine = paths.get(checkpoint) ?? [];
    const landing = steps.filter((b) => b.to.includes(checkpoint));
    if (mine.length === 0) {
      if (landing.length > 0 && landing.every((b) => b.kind === "method" || b.kind === "api")) {
        found.push({ checkpoint, reachedBy: landing.map((b) => b.name) });
      }
      continue;
    }
    const others = [...paths].filter(([other]) => other !== checkpoint);
    const owner = (address: string) => others.find(([, theirs]) => theirs.includes(address))?.[0];
    if (mine.every((address) => owner(address) !== undefined)) {
      found.push({ checkpoint, sharesWith: { page: owner(mine[0]!)!, address: mine[0]! } });
    }
  }
  return found;
}
