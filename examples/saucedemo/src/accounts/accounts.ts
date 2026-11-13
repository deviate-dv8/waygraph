import { account } from "waygraph";
import { loginFlow } from "../flows/auth/login.flow.js";
import { SaucedemoKeys } from "../states/checkout.mem-keys.js";

/**
 * The standard shopper. A flow `as` it starts signed in: the login runs once and its session is reused, by later runs
 * and test workers too, for 9 minutes (Sauce Demo signs you out after 10).
 */
export const StandardUser = account("standard-user", {
  signIn: loginFlow,
  mem: (m) => m.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" }).set(SaucedemoKeys.signedIn, true),
  ttl: "9m",
});

/** A second shopper, with a cart of their own: the other side of a flow with two people. */
export const ProblemUser = account("problem-user", {
  signIn: loginFlow,
  mem: (m) => m.set(SaucedemoKeys.credentials, { username: "problem_user", password: "secret_sauce" }).set(SaucedemoKeys.signedIn, true),
  ttl: "9m",
});
