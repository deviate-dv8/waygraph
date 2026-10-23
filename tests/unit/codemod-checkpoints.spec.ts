import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertBlocks, convertStates } from "../../src/cli/commands/codemod-checkpoints.js";

const states = `import type { Checkpoint } from "waygraph";

export type Home = Checkpoint<"Home">;
export type CartEmpty = Checkpoint<"CartEmpty">;
export type ItemInCart = Checkpoint<"ItemInCart">;
export type CanAdd = Home | CartEmpty;
`;

describe("codemod checkpoints", () => {
  it("turns state types into values and union aliases into lists", () => {
    const info = { tags: new Map<string, string>(), unions: new Map<string, string[]>() };
    const out = convertStates(states, info);
    assert.match(out, /^import \{ checkpoint \} from "waygraph";/);
    assert.match(out, /export const Home = checkpoint\("Home"\);\nexport type Home = typeof Home;/);
    assert.match(out, /export const CanAdd = \[Home, CartEmpty\] as const;\nexport type CanAdd = \(typeof CanAdd\)\[number\];/);
    // running it again over converted text is a no-op and still learns the names
    const again = { tags: new Map<string, string>(), unions: new Map<string, string[]>() };
    assert.equal(convertStates(out, again), out);
    assert.deepEqual([...again.tags.keys()], ["Home", "CartEmpty", "ItemInCart"]);
  });

  it("rewrites Block calls to Checkpoint values and drops the implied resolve", () => {
    const info = { tags: new Map<string, string>(), unions: new Map<string, string[]>() };
    convertStates(states, info);
    const block = `import { defineMethodBlock, defineNavBlock, checkpoint } from "waygraph";
import type { CanAdd, ItemInCart, Home } from "../states/demo.states.js";

export const NavHome = defineNavBlock<Home>({ name: "nav-home", checkpoint: "Home", url: "/" });

export const Add = defineMethodBlock<CanAdd, ItemInCart>({
  name: "add",
  instruction: {
    async act() {},
    resolve: () => checkpoint("ItemInCart"),
  },
});
`;
    const { text, skipped } = convertBlocks(block, info);
    assert.deepEqual(skipped, []);
    assert.match(text, /import \{ defineMethodBlock, defineNavBlock \} from "waygraph";/);
    assert.match(text, /import \{ CanAdd, ItemInCart, Home \} from/);
    assert.match(text, /defineNavBlock\(\{ name: "nav-home", checkpoint: Home, url: "\/" \}\)/);
    assert.match(text, /defineMethodBlock\(\{\n  name: "add",\n  from: CanAdd,\n  to: ItemInCart,\n  instruction/);
    assert.doesNotMatch(text, /resolve:/);
  });

  it("leaves calls whose Checkpoints it does not know", () => {
    const info = { tags: new Map<string, string>(), unions: new Map<string, string[]>() };
    const { text, skipped } = convertBlocks(`defineMethodBlock<Foo, Bar>({ name: "x", instruction: {} });`, info);
    assert.equal(text, `defineMethodBlock<Foo, Bar>({ name: "x", instruction: {} });`);
    assert.equal(skipped.length, 1);
  });
});
