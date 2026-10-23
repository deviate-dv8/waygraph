import { checkpoint } from "waygraph";

export const Home = checkpoint("Home");
export type Home = typeof Home;
export const HomeVerified = checkpoint("HomeVerified");
export type HomeVerified = typeof HomeVerified;
export const ItemInCart = checkpoint("ItemInCart");
export type ItemInCart = typeof ItemInCart;
export const CartEmpty = checkpoint("CartEmpty");
export type CartEmpty = typeof CartEmpty;

/** Anywhere an item can be added from: fresh on Home, or after the cart was emptied. */
export const CanAddItem = [Home, CartEmpty] as const;
export type CanAddItem = (typeof CanAddItem)[number];

export const Docs = checkpoint("Docs");
export type Docs = typeof Docs;
