import { reads } from "waygraph";

/**
 * What the home page shows: its title, the cart count, each catalogue item with whether it is in the cart, and whether
 * the verified banner is up (after the emailed link).
 */
export const HomeRead = reads("home")<{
  title: string;
  cartCount: number;
  items: { name: string; inCart: boolean }[];
  verified: boolean;
}>();
