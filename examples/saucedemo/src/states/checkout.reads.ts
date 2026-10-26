import { reads } from "waygraph/beta";

// What the store's pages show, by namespace: the Read Blocks fill these, `pilot read` returns them as JSON.
export const Catalog = reads("catalog")<{
  items: { name: string; price: number; inCart: boolean }[];
  sort: string;
}>();
export const Cart = reads("cart")<{ lines: { name: string; qty: number; price: number }[] }>();
export const Header = reads("header")<{ title: string; cartCount: number }>();
