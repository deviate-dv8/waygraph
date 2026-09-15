import type { Checkpoint } from "waygraph";

// One Checkpoint per real state the target app can be in - the whole shape
// of this quickstart's Flow, readable in one place before you ever open a
// Block file. `Start` is waygraph's own exported type, not redeclared here.

export type LoginPage = Checkpoint<"LoginPage">;
export type LoggedIn = Checkpoint<"LoggedIn">;
export type ItemInCart = Checkpoint<"ItemInCart">;
export type CheckoutInfoFilled = Checkpoint<"CheckoutInfoFilled">;
export type OrderComplete = Checkpoint<"OrderComplete">;
