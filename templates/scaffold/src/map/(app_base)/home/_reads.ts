import { reads } from "waygraph";

/** What the home page shows: its title, the cart count, and each catalogue item with whether it is in the cart. */
export const HomeRead = reads("home")<{
  title: string;
  cartCount: number;
  items: { name: string; inCart: boolean }[];
}>();
