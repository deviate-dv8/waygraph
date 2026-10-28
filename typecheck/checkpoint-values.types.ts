import {
  checkpoint,
  defineAssertBlock,
  defineEffectBlock,
  defineMethodBlock,
  defineNavBlock,
  definePageBlock,
  Engine,
  keys,
} from "../src/index.js";
import type { MethodBlock, NavBlock } from "../src/index.js";

export const Home = checkpoint("Home");
export type Home = typeof Home;
export const CartEmpty = checkpoint("CartEmpty");
export type CartEmpty = typeof CartEmpty;
export const ItemInCart = checkpoint("ItemInCart");
export type ItemInCart = typeof ItemInCart;
const { item: Item } = keys("test")<{ item: string }>();

export const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: "/" });
export const navType: NavBlock<Home> = NavHome;

export const HomeHub = definePageBlock({ name: "page-home", checkpoint: Home });

export const AddItem = defineMethodBlock({
  name: "add-item",
  from: [Home, CartEmpty],
  to: ItemInCart,
  instruction: {
    async act() {},
  },
});
export const addType: MethodBlock<Home | CartEmpty, ItemInCart> = AddItem;

export const Clear = defineMethodBlock({
  name: "clear",
  from: ItemInCart,
  to: CartEmpty,
  instruction: { async act() {}, resolve: () => CartEmpty },
});

export const AddEffect = defineEffectBlock({
  name: "add-effect",
  from: Home,
  to: ItemInCart,
  requires: [Item],
  instanceOptions: async () => [],
  instruction: { async act() {} },
});

export const Seen = defineAssertBlock({ name: "seen", checkpoint: ItemInCart, verify: [] });

// The chain still type-checks step to step.
export const flow = new Engine().map().start().gotoPage(NavHome).method(AddItem).assert(Seen).method(Clear).end();

// @ts-expect-error Clear runs from ItemInCart, not Home
new Engine().map().start().gotoPage(NavHome).method(Clear).end();

defineMethodBlock({
  name: "bad",
  from: Home,
  to: ItemInCart,
  // @ts-expect-error resolve must return the declared `to`
  instruction: { async act() {}, resolve: () => CartEmpty },
});
