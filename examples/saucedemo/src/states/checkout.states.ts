import type { Checkpoint } from "waygraph";

// One Checkpoint per real state the target app can be in - kept together so the
// whole checkout flow's state space reads in one place, the same reason a
// backend keeps its models together instead of scattered across handlers.
// `Start` is waygraph's own exported type, not redeclared here.

export type LoginPage = Checkpoint<"LoginPage">;
export type LoggedIn = Checkpoint<"LoggedIn">;
/** submit-login: inventory on success, login form + error banner on auth failure. */
export type LoginSubmitOutcome = LoggedIn | LoginPage;
export type ItemInCart = Checkpoint<"ItemInCart">;
/** remove-from-cart: still has items → ItemInCart; empty cart → LoggedIn. */
export type RemoveFromCartOutcome = ItemInCart | LoggedIn;
export type CartPage = Checkpoint<"CartPage">;
export type CheckoutInfoPage = Checkpoint<"CheckoutInfoPage">;
export type CheckoutOverviewPage = Checkpoint<"CheckoutOverviewPage">;
export type ItemDetailPage = Checkpoint<"ItemDetailPage">;
export type OrderComplete = Checkpoint<"OrderComplete">;
