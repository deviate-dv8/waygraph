import { account } from "waygraph";
import { loginFlow } from "../flows/login.flow.js";

/**
 * The standard shopper. A flow `as` it starts signed in: the login runs once and its session is reused, by later runs
 * and test workers too, for 9 minutes (Sauce Demo signs you out after 10).
 */
export const StandardUser = account("standard-user", { signIn: loginFlow, ttl: "9m" });
