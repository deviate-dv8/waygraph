import { checkpoint } from "waygraph";

// One Checkpoint per page of the target app - kept together so the whole
// checkout flow's pages read in one place. What changes on a page (what's in
// the cart) is what its Read Block shows, not another Checkpoint.
// `Start` is waygraph's own exported type, not redeclared here.

export const LoginPage = checkpoint("LoginPage");
export type LoginPage = typeof LoginPage;
export const InventoryPage = checkpoint("InventoryPage");
export type InventoryPage = typeof InventoryPage;
/** submit-login: inventory on success, login form + error banner on auth failure. */
export const LoginSubmitOutcome = [InventoryPage, LoginPage] as const;
export type LoginSubmitOutcome = (typeof LoginSubmitOutcome)[number];
export const CartPage = checkpoint("CartPage");
export type CartPage = typeof CartPage;
export const CheckoutInfoPage = checkpoint("CheckoutInfoPage");
export type CheckoutInfoPage = typeof CheckoutInfoPage;
export const CheckoutOverviewPage = checkpoint("CheckoutOverviewPage");
export type CheckoutOverviewPage = typeof CheckoutOverviewPage;
export const ItemDetailPage = checkpoint("ItemDetailPage");
export type ItemDetailPage = typeof ItemDetailPage;
export const OrderComplete = checkpoint("OrderComplete");
export type OrderComplete = typeof OrderComplete;
