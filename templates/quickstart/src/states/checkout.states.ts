import { checkpoint } from "waygraph";

// One Checkpoint per real state the target app can be in - kept together so the
// whole checkout flow's state space reads in one place, the same reason a
// backend keeps its models together instead of scattered across handlers.
// `Start` is waygraph's own exported type, not redeclared here.

export const LoginPage = checkpoint("LoginPage");
export type LoginPage = typeof LoginPage;
export const LoggedIn = checkpoint("LoggedIn");
export type LoggedIn = typeof LoggedIn;
/** submit-login: inventory on success, login form + error banner on auth failure. */
export const LoginSubmitOutcome = [LoggedIn, LoginPage] as const;
export type LoginSubmitOutcome = (typeof LoginSubmitOutcome)[number];
export const ItemInCart = checkpoint("ItemInCart");
export type ItemInCart = typeof ItemInCart;
/** remove-from-cart: still has items → ItemInCart; empty cart → LoggedIn. */
export const RemoveFromCartOutcome = [ItemInCart, LoggedIn] as const;
export type RemoveFromCartOutcome = (typeof RemoveFromCartOutcome)[number];
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
