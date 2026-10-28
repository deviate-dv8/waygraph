import { reads } from "waygraph";

// What the store's pages show, by namespace: the Read Blocks fill these, `pilot read` returns them as JSON.
export const Catalog = reads("catalog")<{
  items: { name: string; price: number; inCart: boolean }[];
  sort: string;
}>();
export const Cart = reads("cart")<{ lines: { name: string; qty: number; price: number }[] }>();
export const Header = reads("header")<{ title: string; cartCount: number }>();
export const Login = reads("login")<{ error: string }>();
export const ItemDetail = reads("itemDetail")<{ name: string; price: number; description: string; inCart: boolean }>();
export const CheckoutInfo = reads("checkoutInfo")<{ firstName: string; lastName: string; postalCode: string; error: string }>();
export const CheckoutOverview = reads("checkoutOverview")<{ items: { name: string; price: number }[]; total: number }>();
export const OrderDone = reads("orderDone")<{ header: string }>();
